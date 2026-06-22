import type { Pool } from 'pg';
import type {
  BuybackInput,
  CreateTournamentInput,
  EnterTournamentInput,
  RegisterTournamentInput,
  TournamentListQuery,
  TournamentMatchesQuery,
} from '@vr-tournament/shared';
import {
  mapBuyback,
  mapMatch,
  mapParticipant,
  mapRegistration,
  mapTournament,
  mapTournamentRound,
} from '../../lib/mappers.js';
import { AppError } from '../../lib/response.js';
import type { Env } from '../../config/env.js';
import { enqueueNotification } from '../../lib/bullmq.js';
import type { RedisClient } from '../../lib/redis.js';
import { requeuePlayer, removeFromQueue } from '../../lib/requeue-player.js';
import { releaseSlotLock } from '../../lib/slot-lock.js';
import { BookingsService } from '../bookings/bookings.service.js';
import {
  KNOCKOUT_ROUNDS,
  knockoutRoundLabel,
  playersToAdvance,
  shouldStartKnockout,
  isSlotStartPast,
} from '@vr-tournament/shared';
import { createBuybackPaymentIntent } from '../../lib/stripe.js';

const MATCH_SELECT = `
  SELECT m.*,
         u1.username AS p1_username, u1.skill_tier AS p1_skill_tier, u1.has_vr_headset AS p1_has_vr,
         u2.username AS p2_username, u2.skill_tier AS p2_skill_tier, u2.has_vr_headset AS p2_has_vr,
         v.name AS venue_name, v.city AS venue_city, v.address AS venue_address,
         ts.start_time AS slot_start, ts.end_time AS slot_end
  FROM matches m
  JOIN users u1 ON u1.id = m.player1_id
  JOIN users u2 ON u2.id = m.player2_id
  LEFT JOIN venues v ON v.id = m.venue_id
  LEFT JOIN time_slots ts ON ts.id = m.time_slot_id
`;

export class TournamentsService {
  constructor(
    private pool: Pool,
    private redis?: RedisClient,
    private env?: Env
  ) {}

  async list(query: TournamentListQuery) {
    const params: unknown[] = [];
    let where = 'WHERE 1=1';

    if (query.status) {
      params.push(query.status);
      where += ` AND t.status = $${params.length}`;
    }
    if (query.tier) {
      params.push(query.tier);
      where += ` AND t.skill_tier = $${params.length}`;
    }
    if (query.cursor) {
      params.push(query.cursor);
      where += ` AND t.id < $${params.length}`;
    }

    params.push(query.limit + 1);
    const limitIdx = params.length;

    const result = await this.pool.query(
      `SELECT t.*,
              (SELECT COUNT(*)::int FROM tournament_registrations tr WHERE tr.tournament_id = t.id) AS registration_count
       FROM tournaments t
       ${where}
       ORDER BY t.start_date ASC, t.id DESC
       LIMIT $${limitIdx}`,
      params
    );

    const rows = result.rows;
    const hasMore = rows.length > query.limit;
    const items = (hasMore ? rows.slice(0, query.limit) : rows).map(mapTournament);

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
    };
  }

  async getById(id: string) {
    const result = await this.pool.query(
      `SELECT t.*,
              (SELECT COUNT(*)::int FROM tournament_registrations tr WHERE tr.tournament_id = t.id) AS registration_count
       FROM tournaments t WHERE t.id = $1`,
      [id]
    );
    if (!result.rows[0]) {
      throw new AppError('NOT_FOUND', 'Tournament not found', 404);
    }
    return mapTournament(result.rows[0]);
  }

  async create(input: CreateTournamentInput) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO tournaments (name, game, format, start_date, end_date, status, max_players, skill_tier, buyback_price_cents)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          input.name,
          input.game,
          input.format,
          input.startDate,
          input.endDate,
          input.status ?? 'draft',
          input.maxPlayers ?? null,
          input.skillTier ?? 3,
          input.buybackPriceCents ?? 500,
        ]
      );
      const tournament = result.rows[0];
      const startsAt = new Date(input.startDate);
      const endsAt = new Date(startsAt);
      endsAt.setDate(endsAt.getDate() + 3);

      await client.query(
        `INSERT INTO tournament_rounds (tournament_id, round_number, starts_at, ends_at, status)
         VALUES ($1, 1, $2, $3, 'active')`,
        [tournament.id, startsAt, endsAt]
      );
      await client.query('COMMIT');
      return mapTournament(tournament);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async register(tournamentId: string, userId: string, input: RegisterTournamentInput) {
    const tournament = await this.getById(tournamentId);
    if (tournament.status !== 'open') {
      throw new AppError('CONFLICT', 'Tournament is not open for registration', 409);
    }

    const userResult = await this.pool.query(
      `SELECT id FROM users WHERE id = $1`,
      [userId]
    );
    if (!userResult.rows[0]) throw new AppError('NOT_FOUND', 'User not found', 404);

    if (tournament.maxPlayers && (tournament.registrationCount ?? 0) >= tournament.maxPlayers) {
      throw new AppError('CONFLICT', 'Tournament is full', 409);
    }

    if (input.bookingId) {
      const booking = await this.pool.query(
        `SELECT id FROM bookings WHERE id = $1 AND user_id = $2 AND status = 'confirmed'`,
        [input.bookingId, userId]
      );
      if (!booking.rows[0]) {
        throw new AppError('BAD_REQUEST', 'Invalid booking for registration', 400);
      }
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO tournament_registrations (tournament_id, user_id, booking_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (tournament_id, user_id) DO UPDATE SET booking_id = COALESCE(EXCLUDED.booking_id, tournament_registrations.booking_id)
         RETURNING *`,
        [tournamentId, userId, input.bookingId ?? null]
      );

      await client.query(
        `INSERT INTO tournament_participants (tournament_id, user_id, status, round_number)
         VALUES ($1, $2, 'active', $3)
         ON CONFLICT (tournament_id, user_id) DO NOTHING`,
        [tournamentId, userId, tournament.currentRoundNumber]
      );

      await client.query('COMMIT');

      if (this.env) {
        enqueueNotification(this.env, {
          userId,
          type: 'tournament_registered',
          channels: ['in_app', 'email'],
          payload: {
            tournamentId,
            tournamentName: tournament.name,
            startDate: tournament.startDate,
          },
          idempotencyKey: `tournament-reg:${tournamentId}:${userId}`,
        }).catch((err: unknown) => {
          console.error('Failed to enqueue tournament registration notification:', err);
        });
      }

      return mapRegistration(result.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async enter(tournamentId: string, userId: string, input: EnterTournamentInput) {
    if (!this.redis) throw new AppError('INTERNAL', 'Redis not configured', 500);

    const tournament = await this.getById(tournamentId);
    if (tournament.status !== 'open' && tournament.status !== 'in_progress') {
      throw new AppError('CONFLICT', 'Tournament is not accepting entries', 409);
    }

    const userResult = await this.pool.query(
      `SELECT has_vr_headset FROM users WHERE id = $1`,
      [userId]
    );
    const user = userResult.rows[0];
    if (!user) throw new AppError('NOT_FOUND', 'User not found', 404);

    const existingReg = await this.getRegistration(tournamentId, userId);
    let bookingId = existingReg?.bookingId ?? null;
    let booking = null;
    let preferredVenueId: string | null = null;

    if (!user.has_vr_headset) {
      if (!existingReg) {
        if (!input.timeSlotId) {
          throw new AppError('BAD_REQUEST', 'timeSlotId is required for venue players', 400);
        }

        const slotCheck = await this.pool.query(
          `SELECT ts.id, ts.venue_id FROM time_slots ts
           JOIN venues v ON v.id = ts.venue_id
           WHERE ts.id = $1 AND v.active = TRUE`,
          [input.timeSlotId]
        );
        if (!slotCheck.rows[0]) {
          throw new AppError('BAD_REQUEST', 'Invalid time slot', 400);
        }

        const slotTime = await this.pool.query(
          `SELECT start_time FROM time_slots WHERE id = $1`,
          [input.timeSlotId]
        );
        if (slotTime.rows[0] && isSlotStartPast(slotTime.rows[0].start_time)) {
          throw new AppError('BAD_REQUEST', 'Cannot book a time slot that has already started', 400);
        }

        if (input.venueId && input.venueId !== slotCheck.rows[0].venue_id) {
          throw new AppError('BAD_REQUEST', 'Slot does not belong to the selected venue', 400);
        }

        preferredVenueId = slotCheck.rows[0].venue_id;
        const bookingsService = new BookingsService(this.pool, this.redis);
        booking = await bookingsService.create(userId, input.timeSlotId);
        bookingId = booking.id;
      } else if (bookingId) {
        const venueRow = await this.pool.query(
          `SELECT ts.venue_id FROM bookings b
           JOIN time_slots ts ON ts.id = b.time_slot_id WHERE b.id = $1`,
          [bookingId]
        );
        preferredVenueId = venueRow.rows[0]?.venue_id ?? null;
      }
    }

    const registration = existingReg
      ? existingReg
      : await this.register(tournamentId, userId, { bookingId: bookingId ?? undefined });

    const participant = await this.getParticipant(tournamentId, userId);
    if (participant && !['active', 'advanced'].includes(participant.status)) {
      throw new AppError('FORBIDDEN', 'You are eliminated from this tournament', 403);
    }

    const roundNumber = participant?.roundNumber ?? 1;

    await removeFromQueue(this.redis, userId);
    await requeuePlayer(this.pool, this.redis, userId, {
      tournamentId,
      preferredVenueId,
      roundNumber,
      bookingId,
    }, this.env);

    return {
      registration,
      booking,
      searching: true,
    };
  }

  async getRegistration(tournamentId: string, userId: string) {
    const result = await this.pool.query(
      `SELECT * FROM tournament_registrations WHERE tournament_id = $1 AND user_id = $2`,
      [tournamentId, userId]
    );
    return result.rows[0] ? mapRegistration(result.rows[0]) : null;
  }

  async getParticipant(tournamentId: string, userId: string) {
    const result = await this.pool.query(
      `SELECT tp.*, u.username FROM tournament_participants tp
       JOIN users u ON u.id = tp.user_id
       WHERE tp.tournament_id = $1 AND tp.user_id = $2`,
      [tournamentId, userId]
    );
    return result.rows[0] ? mapParticipant(result.rows[0]) : null;
  }

  async getRounds(tournamentId: string) {
    await this.getById(tournamentId);
    const result = await this.pool.query(
      `SELECT * FROM tournament_rounds WHERE tournament_id = $1 ORDER BY round_number ASC`,
      [tournamentId]
    );
    return result.rows.map(mapTournamentRound);
  }

  async getParticipants(tournamentId: string) {
    await this.getById(tournamentId);
    const result = await this.pool.query(
      `SELECT tp.*, u.username FROM tournament_participants tp
       JOIN users u ON u.id = tp.user_id
       WHERE tp.tournament_id = $1
       ORDER BY tp.wins DESC, tp.losses ASC, tp.created_at ASC`,
      [tournamentId]
    );
    return result.rows.map(mapParticipant);
  }

  async getMatches(tournamentId: string, query: TournamentMatchesQuery) {
    await this.getById(tournamentId);
    const params: unknown[] = [tournamentId];
    let where = 'WHERE m.tournament_id = $1';

    if (query.round !== undefined) {
      params.push(query.round);
      where += ` AND m.round_number = $${params.length}`;
    }
    if (query.phase) {
      params.push(query.phase);
      where += ` AND m.phase = $${params.length}`;
    }

    const result = await this.pool.query(
      `${MATCH_SELECT} ${where} ORDER BY m.round_number ASC, m.created_at ASC`,
      params
    );
    return result.rows.map(mapMatch);
  }

  async createBuybackCheckout(tournamentId: string, userId: string, input: BuybackInput) {
    if (!this.env) throw new AppError('INTERNAL', 'Env not configured', 500);

    const tournament = await this.getById(tournamentId);
    if (tournament.phase !== 'normal') {
      throw new AppError('CONFLICT', 'Buybacks are only available during normal rounds', 409);
    }

    const participant = await this.getParticipant(tournamentId, userId);
    if (!participant) {
      throw new AppError('FORBIDDEN', 'Not registered for this tournament', 403);
    }
    if (participant.status !== 'eliminated') {
      throw new AppError('CONFLICT', 'Only eliminated players can buy back', 409);
    }

    const roundOpen = await this.pool.query(
      `SELECT id FROM tournament_rounds
       WHERE tournament_id = $1 AND round_number = $2 AND status = 'active' AND ends_at > NOW()`,
      [tournamentId, participant.roundNumber]
    );
    if (!roundOpen.rows[0]) {
      throw new AppError('CONFLICT', 'Round time has ended — buybacks are no longer available', 409);
    }

    return createBuybackPaymentIntent(this.env, this.pool, {
      userId,
      tournamentId,
      roundNumber: participant.roundNumber,
      matchId: input.matchId ?? null,
      amountCents: tournament.buybackPriceCents,
    });
  }

  async fulfillBuyback(buybackId: string) {
    if (!this.redis) throw new AppError('INTERNAL', 'Redis not configured', 500);

    const buybackRow = await this.pool.query(`SELECT * FROM buybacks WHERE id = $1`, [buybackId]);
    const buyback = buybackRow.rows[0];
    if (!buyback) throw new AppError('NOT_FOUND', 'Buyback not found', 404);
    if (buyback.status === 'completed') return mapBuyback(buyback);

    const tournamentId = buyback.tournament_id;
    const userId = buyback.user_id;

    const reg = await this.getRegistration(tournamentId, userId);
    let preferredVenueId: string | null = null;
    if (reg?.bookingId) {
      const venueRow = await this.pool.query(
        `SELECT ts.venue_id FROM bookings b
         JOIN time_slots ts ON ts.id = b.time_slot_id WHERE b.id = $1`,
        [reg.bookingId]
      );
      preferredVenueId = venueRow.rows[0]?.venue_id ?? null;
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE buybacks SET status = 'completed' WHERE id = $1`,
        [buybackId]
      );

      await client.query(
        `UPDATE tournament_participants
         SET status = 'active', buyback_count = buyback_count + 1, updated_at = NOW()
         WHERE tournament_id = $1 AND user_id = $2`,
        [tournamentId, userId]
      );

      await client.query('COMMIT');

      await requeuePlayer(this.pool, this.redis, userId, {
        tournamentId,
        roundNumber: buyback.round_number,
        preferredVenueId,
        bookingId: reg?.bookingId ?? null,
      }, this.env);

      if (this.env) {
        enqueueNotification(this.env, {
          userId,
          type: 'buyback_completed',
          channels: ['in_app', 'email'],
          payload: { tournamentId, amountCents: buyback.amount_cents },
          idempotencyKey: `buyback:${buybackId}`,
        }).catch(console.error);
      }

      const updated = await this.pool.query(`SELECT * FROM buybacks WHERE id = $1`, [buybackId]);
      return mapBuyback(updated.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /** @deprecated Use createBuybackCheckout + Stripe webhook */
  async buyback(tournamentId: string, userId: string, input: BuybackInput) {
    if (!this.redis) throw new AppError('INTERNAL', 'Redis not configured', 500);

    const tournament = await this.getById(tournamentId);
    if (tournament.phase !== 'normal') {
      throw new AppError('CONFLICT', 'Buybacks are only available during normal rounds', 409);
    }

    const participant = await this.getParticipant(tournamentId, userId);
    if (!participant) {
      throw new AppError('FORBIDDEN', 'Not registered for this tournament', 403);
    }
    if (participant.status !== 'eliminated') {
      throw new AppError('CONFLICT', 'Only eliminated players can buy back', 409);
    }

    const roundOpen = await this.pool.query(
      `SELECT id FROM tournament_rounds
       WHERE tournament_id = $1 AND round_number = $2 AND status = 'active' AND ends_at > NOW()`,
      [tournamentId, participant.roundNumber]
    );
    if (!roundOpen.rows[0]) {
      throw new AppError('CONFLICT', 'Round time has ended — buybacks are no longer available', 409);
    }

    const reg = await this.getRegistration(tournamentId, userId);
    let preferredVenueId: string | null = null;
    if (reg?.bookingId) {
      const venueRow = await this.pool.query(
        `SELECT ts.venue_id FROM bookings b
         JOIN time_slots ts ON ts.id = b.time_slot_id
         WHERE b.id = $1`,
        [reg.bookingId]
      );
      preferredVenueId = venueRow.rows[0]?.venue_id ?? null;
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const buybackResult = await client.query(
        `INSERT INTO buybacks (user_id, tournament_id, round_number, match_id, amount_cents, status)
         VALUES ($1, $2, $3, $4, $5, 'completed')
         RETURNING *`,
        [
          userId,
          tournamentId,
          participant.roundNumber,
          input.matchId ?? null,
          tournament.buybackPriceCents,
        ]
      );

      await client.query(
        `UPDATE tournament_participants
         SET status = 'active', buyback_count = buyback_count + 1, updated_at = NOW()
         WHERE tournament_id = $1 AND user_id = $2`,
        [tournamentId, userId]
      );

      await client.query('COMMIT');

      await requeuePlayer(this.pool, this.redis, userId, {
        tournamentId,
        roundNumber: participant.roundNumber,
        preferredVenueId,
        bookingId: reg?.bookingId ?? null,
      }, this.env);

      if (this.env) {
        enqueueNotification(this.env, {
          userId,
          type: 'buyback_completed',
          channels: ['in_app', 'email'],
          payload: { tournamentId, amountCents: tournament.buybackPriceCents },
          idempotencyKey: `buyback:${buybackResult.rows[0].id}`,
        }).catch(console.error);
      }

      return mapBuyback(buybackResult.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async withdraw(tournamentId: string, userId: string) {
    if (!this.redis) throw new AppError('INTERNAL', 'Redis not configured', 500);

    const client = await this.pool.connect();

    interface MatchNotification {
      userId: string;
      type: string;
      payload: Record<string, unknown>;
      idempotencyKey: string;
    }
    const toNotify: MatchNotification[] = [];
    const toRequeue: string[] = [];

    try {
      await client.query('BEGIN');

      const regResult = await client.query(
        `DELETE FROM tournament_registrations
         WHERE tournament_id = $1 AND user_id = $2
         RETURNING *`,
        [tournamentId, userId]
      );
      if (!regResult.rows[0]) {
        throw new AppError('NOT_FOUND', 'Registration not found', 404);
      }

      await client.query(
        `UPDATE tournament_participants SET status = 'out', updated_at = NOW()
         WHERE tournament_id = $1 AND user_id = $2`,
        [tournamentId, userId]
      );

      const activeMatches = await client.query(
        `SELECT * FROM matches
         WHERE tournament_id = $1
           AND (player1_id = $2 OR player2_id = $2)
           AND status IN ('pending_confirmation', 'confirmed', 'in_progress')`,
        [tournamentId, userId]
      );

      for (const m of activeMatches.rows) {
        const isP1: boolean = m.player1_id === userId;
        const otherId: string = isP1 ? m.player2_id : m.player1_id;
        const res = m.result as {
          player1Score: number | null;
          player2Score: number | null;
        } | null;
        const otherScore = isP1 ? res?.player2Score : res?.player1Score;
        const otherBatted = m.status === 'in_progress' && otherScore != null;

        if (otherBatted) {
          await client.query(
            `UPDATE matches SET status = 'completed', result = $1, updated_at = now() WHERE id = $2`,
            [JSON.stringify({ ...res, winnerId: otherId }), m.id]
          );
          toNotify.push({
            userId: otherId,
            type: 'match_won',
            payload: { matchId: m.id, reason: 'opponent_withdrew' },
            idempotencyKey: `match-won:${m.id}:${otherId}`,
          });
        } else {
          await client.query(
            `UPDATE matches SET status = 'cancelled', updated_at = now() WHERE id = $1`,
            [m.id]
          );
          if (m.time_slot_id) {
            await releaseSlotLock(this.pool, this.redis, m.time_slot_id);
          }
          toRequeue.push(otherId);
          toNotify.push({
            userId: otherId,
            type: 'opponent_withdrew_requeued',
            payload: { matchId: m.id, tournamentId, autoRequeued: true },
            idempotencyKey: `match-cancelled-withdrawal:${m.id}:${otherId}`,
          });
        }
      }

      await client.query('COMMIT');

      await removeFromQueue(this.redis, userId);

      for (const otherId of toRequeue) {
        await requeuePlayer(this.pool, this.redis, otherId, { tournamentId }, this.env);
      }

      if (this.env) {
        for (const n of toNotify) {
          enqueueNotification(this.env, { ...n, channels: ['in_app', 'email'] }).catch(console.error);
        }
      }

      return mapRegistration(regResult.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getBracket(tournamentId: string) {
    const tournament = await this.getById(tournamentId);

    const existingMatches = await this.pool.query(
      `SELECT m.*, u1.username AS p1_username, u1.skill_tier AS p1_skill_tier,
              u2.username AS p2_username, u2.skill_tier AS p2_skill_tier
       FROM matches m
       JOIN users u1 ON u1.id = m.player1_id
       JOIN users u2 ON u2.id = m.player2_id
       WHERE m.tournament_id = $1
       ORDER BY m.round_number ASC, m.bracket_slot ASC NULLS LAST, m.created_at ASC`,
      [tournamentId]
    );

    const roundMap = new Map<number, typeof existingMatches.rows>();

    for (const m of existingMatches.rows) {
      const roundNum = m.round_number ?? 1;
      if (!roundMap.has(roundNum)) roundMap.set(roundNum, []);
      roundMap.get(roundNum)!.push(m);
    }

    const rounds = Array.from(roundMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([roundNum, matches]) => ({
        round: roundNum,
        label:
          roundNum >= KNOCKOUT_ROUNDS.ro16
            ? knockoutRoundLabel(roundNum)
            : `Normal Round ${roundNum}`,
        phase: (roundNum >= KNOCKOUT_ROUNDS.ro16 ? 'knockout' : 'normal') as 'normal' | 'knockout',
        matches: matches.map((m) => ({
          matchId: m.id,
          bracketSlot: m.bracket_slot,
          player1: { id: m.player1_id, username: m.p1_username, skillTier: m.p1_skill_tier },
          player2: { id: m.player2_id, username: m.p2_username, skillTier: m.p2_skill_tier },
          status: m.status,
          winnerId: (m.result as { winnerId?: string } | null)?.winnerId ?? null,
        })),
      }));

    if (rounds.length === 0 && tournament.phase === 'normal') {
      const participants = await this.pool.query(
        `SELECT u.id, u.username, u.skill_tier FROM tournament_participants tp
         JOIN users u ON u.id = tp.user_id
         WHERE tp.tournament_id = $1 AND tp.status IN ('active', 'advanced')
         ORDER BY tp.wins DESC`,
        [tournamentId]
      );
      return {
        tournamentId,
        format: tournament.format,
        phase: tournament.phase,
        rounds: [
          {
            round: tournament.currentRoundNumber,
            label: `Normal Round ${tournament.currentRoundNumber}`,
            phase: 'normal' as const,
            matches: [],
          },
        ],
      };
    }

    return {
      tournamentId,
      format: tournament.format,
      phase: tournament.phase,
      rounds,
    };
  }

  /** Called by close-round worker */
  async closeExpiredRounds() {
    const expired = await this.pool.query(
      `SELECT tr.*, t.current_round_number, t.phase
       FROM tournament_rounds tr
       JOIN tournaments t ON t.id = tr.tournament_id
       WHERE tr.status = 'active' AND tr.ends_at < NOW() AND t.phase = 'normal'`
    );

    for (const round of expired.rows) {
      await this.closeRound(round.tournament_id, round.round_number);
    }
  }

  async closeRound(tournamentId: string, roundNumber: number) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const roundResult = await client.query(
        `SELECT * FROM tournament_rounds
         WHERE tournament_id = $1 AND round_number = $2 AND status = 'active'
         FOR UPDATE`,
        [tournamentId, roundNumber]
      );
      if (!roundResult.rows[0]) {
        await client.query('ROLLBACK');
        return;
      }

      await client.query(
        `UPDATE tournament_rounds SET status = 'closed' WHERE tournament_id = $1 AND round_number = $2`,
        [tournamentId, roundNumber]
      );

      const activeResult = await client.query(
        `SELECT tp.*, tr.registered_at FROM tournament_participants tp
         JOIN tournament_registrations tr ON tr.tournament_id = tp.tournament_id AND tr.user_id = tp.user_id
         WHERE tp.tournament_id = $1 AND tp.status IN ('active', 'advanced')
         ORDER BY tp.wins DESC, tp.losses ASC, tr.registered_at ASC`,
        [tournamentId]
      );

      const active = activeResult.rows;
      const activeCount = active.length;

      if (shouldStartKnockout(activeCount)) {
        await this.generateKnockoutBracket(client, tournamentId, active);
        await client.query(
          `UPDATE tournaments SET phase = 'knockout', updated_at = NOW() WHERE id = $1`,
          [tournamentId]
        );
      } else {
        const keepCount = playersToAdvance(activeCount);
        const advancing = active.slice(0, keepCount);
        const eliminated = active.slice(keepCount);

        for (const p of advancing) {
          await client.query(
            `UPDATE tournament_participants SET status = 'advanced', round_number = $1, updated_at = NOW()
             WHERE id = $2`,
            [roundNumber + 1, p.id]
          );
        }
        for (const p of eliminated) {
          await client.query(
            `UPDATE tournament_participants SET status = 'out', updated_at = NOW() WHERE id = $1`,
            [p.id]
          );
        }

        for (const p of advancing) {
          await client.query(
            `UPDATE tournament_participants SET status = 'active' WHERE id = $1`,
            [p.id]
          );
        }

        const nextStarts = new Date();
        const nextEnds = new Date(nextStarts);
        nextEnds.setDate(nextEnds.getDate() + 3);

        await client.query(
          `INSERT INTO tournament_rounds (tournament_id, round_number, starts_at, ends_at, status)
           VALUES ($1, $2, $3, $4, 'active')`,
          [tournamentId, roundNumber + 1, nextStarts, nextEnds]
        );

        await client.query(
          `UPDATE tournaments SET current_round_number = $1, updated_at = NOW() WHERE id = $2`,
          [roundNumber + 1, tournamentId]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  private async generateKnockoutBracket(
    client: import('pg').PoolClient,
    tournamentId: string,
    players: Array<{ user_id: string }>
  ) {
    const sorted = players.slice(0, 16);
    for (let i = 0; i < sorted.length; i++) {
      await client.query(
        `UPDATE tournament_participants SET status = 'knockout', updated_at = NOW()
         WHERE tournament_id = $1 AND user_id = $2`,
        [tournamentId, sorted[i].user_id]
      );
    }

    for (let slot = 0; slot < 8; slot++) {
      const p1 = sorted[slot * 2]?.user_id;
      const p2 = sorted[slot * 2 + 1]?.user_id;
      if (!p1 || !p2) continue;

      await client.query(
        `INSERT INTO matches (tournament_id, player1_id, player2_id, status, round_number, phase, bracket_slot)
         VALUES ($1, $2, $3, 'pending_confirmation', $4, 'knockout', $5)`,
        [tournamentId, p1, p2, KNOCKOUT_ROUNDS.ro16, slot]
      );
    }
  }

  async advanceKnockoutWinner(matchId: string, winnerId: string) {
    const matchResult = await this.pool.query(`SELECT * FROM matches WHERE id = $1`, [matchId]);
    const match = matchResult.rows[0];
    if (!match || match.phase !== 'knockout') return;

    const round = match.round_number;
    const slot = match.bracket_slot;
    if (round === null || slot === null) return;

    let nextRound: number;
    if (round === KNOCKOUT_ROUNDS.ro16) nextRound = KNOCKOUT_ROUNDS.qf;
    else if (round === KNOCKOUT_ROUNDS.qf) nextRound = KNOCKOUT_ROUNDS.sf;
    else if (round === KNOCKOUT_ROUNDS.sf) nextRound = KNOCKOUT_ROUNDS.final;
    else return;

    const nextSlot = Math.floor(slot / 2);
    const isPlayer1 = slot % 2 === 0;

    const existing = await this.pool.query(
      `SELECT * FROM matches
       WHERE tournament_id = $1 AND round_number = $2 AND bracket_slot = $3`,
      [match.tournament_id, nextRound, nextSlot]
    );

    if (existing.rows[0]) {
      const col = isPlayer1 ? 'player1_id' : 'player2_id';
      await this.pool.query(`UPDATE matches SET ${col} = $1, updated_at = NOW() WHERE id = $2`, [
        winnerId,
        existing.rows[0].id,
      ]);
    } else {
      await this.pool.query(
        `INSERT INTO matches (tournament_id, player1_id, player2_id, status, round_number, phase, bracket_slot)
         VALUES ($1, $2, $3, 'pending_confirmation', $4, 'knockout', $5)`,
        [
          match.tournament_id,
          isPlayer1 ? winnerId : null,
          isPlayer1 ? null : winnerId,
          nextRound,
          nextSlot,
        ]
      );
    }
  }
}
