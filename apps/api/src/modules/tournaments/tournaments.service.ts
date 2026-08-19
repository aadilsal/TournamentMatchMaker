import type { Pool } from 'pg';
import type {
  BuybackInput,
  CreateTournamentInput,
  EnterTournamentInput,
  EnterTournamentResult,
  RegisterTournamentInput,
  Tournament,
  TournamentListQuery,
  TournamentMatchesQuery,
  TournamentRoundSlot,
  TournamentSlotOptionsQuery,
  TournamentUpdatedReason,
} from '@vr-tournament/shared';
import {
  mapBooking,
  mapBuyback,
  mapMatch,
  mapParticipant,
  mapRegistration,
  mapSlot,
  mapTournament,
  mapTournamentRound,
} from '../../lib/mappers.js';
import { assertNoOtherLiveTournament } from '../../lib/live-participation.js';
import { AppError } from '../../lib/response.js';
import type { Env } from '../../config/env.js';
import { enqueueNotification } from '../../lib/bullmq.js';
import type { RedisClient } from '../../lib/redis.js';
import { requeuePlayer, removeFromQueue } from '../../lib/requeue-player.js';
import { releaseSlotLock } from '../../lib/slot-lock.js';
import { BookingsService } from '../bookings/bookings.service.js';
import {
  KNOCKOUT_ROUNDS,
  knockoutDraw,
  knockoutRoundLabel,
  playersToAdvance,
  resolveFieldSize,
  shouldStartKnockout,
  isSlotEnded,
  isSlotStartPast,
  isSlotWithinWindow,
} from '@vr-tournament/shared';
import { createBuybackPaymentIntent } from '../../lib/stripe.js';
import { emitTournamentUpdated } from '../../socket/sync-events.js';
import { emitToUser } from '../../socket/emitters.js';
import { settleOpenMatches } from '../../lib/match-outcome.js';

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

/**
 * Lifecycle rank for ordering. Live and upcoming tournaments must never be
 * pushed off the page by finished ones, however many of those pile up, so the
 * public list sorts on this before anything else. Higher sorts first, which
 * keeps every ORDER BY key DESC and lets the cursor use a plain tuple compare.
 */
const statusRank = (alias: string) => `CASE ${alias}.status
           WHEN 'in_progress' THEN 3
           WHEN 'open' THEN 2
           WHEN 'closed' THEN 1
           ELSE 0
         END`;

const ROUND_SLOT_SELECT = `
  SELECT rs.*,
         ts.venue_id AS slot_venue_id, ts.start_time, ts.end_time,
         ts.max_capacity, ts.booked_count, ts.status AS slot_status,
         ts.created_at AS slot_created_at,
         v.name AS venue_name, v.city AS venue_city, v.address AS venue_address
  FROM tournament_round_slots rs
  JOIN time_slots ts ON ts.id = rs.time_slot_id
  LEFT JOIN venues v ON v.id = rs.venue_id
`;

interface RoundSlotRow {
  tournament_id: string;
  user_id: string;
  round_number: number;
  time_slot_id: string;
  venue_id: string | null;
  booking_id: string | null;
  slot_venue_id?: string;
  start_time?: Date;
  end_time?: Date;
  max_capacity?: number;
  booked_count?: number;
  slot_status?: string;
  slot_created_at?: Date;
  venue_name?: string | null;
  venue_city?: string | null;
  venue_address?: string | null;
}

function mapRoundSlotRow(row: RoundSlotRow): TournamentRoundSlot {
  const roundSlot: TournamentRoundSlot = {
    tournamentId: row.tournament_id,
    userId: row.user_id,
    roundNumber: row.round_number,
    timeSlotId: row.time_slot_id,
    venueId: row.venue_id,
    bookingId: row.booking_id,
  };

  if (row.start_time && row.end_time) {
    roundSlot.slot = mapSlot({
      id: row.time_slot_id,
      venue_id: row.slot_venue_id ?? row.venue_id ?? '',
      start_time: row.start_time,
      end_time: row.end_time,
      max_capacity: row.max_capacity ?? 0,
      booked_count: row.booked_count ?? 0,
      status: row.slot_status ?? 'available',
      created_at: row.slot_created_at ?? row.start_time,
    });
  }
  if (row.venue_id && row.venue_name) {
    roundSlot.venue = {
      id: row.venue_id,
      name: row.venue_name,
      city: row.venue_city ?? '',
      address: row.venue_address ?? '',
    };
  }

  return roundSlot;
}

export class TournamentsService {
  constructor(
    private pool: Pool,
    private redis?: RedisClient,
    private env?: Env
  ) {}

  async list(query: TournamentListQuery) {
    const params: unknown[] = [];
    // Drafts are internal; admins see them through the admin list instead.
    let where = "WHERE t.status <> 'draft'";

    if (query.status) {
      params.push(query.status);
      where += ` AND t.status = $${params.length}`;
    }
    if (query.tier) {
      params.push(query.tier);
      where += ` AND t.skill_tier = $${params.length}`;
    }
    if (query.cursor) {
      // Keyset on the same tuple the rows are ordered by. The old cursor
      // compared t.id, a random UUID unrelated to the sort, so pages overlapped
      // and rows could be skipped entirely.
      params.push(query.cursor);
      where += ` AND (${statusRank('t')}, t.start_date, t.id) <
                     (SELECT ${statusRank('c')}, c.start_date, c.id
                      FROM tournaments c WHERE c.id = $${params.length})`;
    }

    params.push(query.limit + 1);
    const limitIdx = params.length;

    const result = await this.pool.query(
      `SELECT t.*,
              (SELECT COUNT(*)::int FROM tournament_registrations tr WHERE tr.tournament_id = t.id) AS registration_count
       FROM tournaments t
       ${where}
       ORDER BY ${statusRank('t')} DESC, t.start_date DESC, t.id DESC
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
        `INSERT INTO tournaments (name, game, start_date, end_date, registration_opens_at, registration_closes_at,
                                  status, max_players, skill_tier, buyback_price_cents, round_duration_minutes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          input.name,
          input.game,
          input.startDate,
          input.endDate,
          // Default to a window that opens now and shuts when play begins, which
          // is how tournaments behaved before the window existed.
          input.registrationOpensAt ?? new Date().toISOString(),
          input.registrationClosesAt ?? input.startDate,
          input.status ?? 'draft',
          input.maxPlayers ?? null,
          input.skillTier ?? 3,
          input.buybackPriceCents ?? 500,
          input.roundDurationMinutes ?? 180,
        ]
      );
      const tournament = result.rows[0];
      const startsAt = new Date(input.startDate);
      const durationMinutes = input.roundDurationMinutes ?? 180;
      const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);

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

  /**
   * Keep the opening round's window in step with the tournament's own dates.
   *
   * Round 1 is written once, at creation, from the start date the tournament had
   * then. Editing the start date or the round length afterwards left the round
   * behind, and every downstream reader takes the *round* as the authority: the
   * slot picker only offers slots inside it, `enter` rejects anything outside
   * it, and pairing discards a window that does not fit. A moved start date
   * therefore left a tournament that looked correct on every screen and that
   * nobody could enter.
   *
   * Restricted to a round with no matches in it, so a round already being played
   * is never moved.
   */
  private async realignOpeningRound(tournamentId: string) {
    await this.pool.query(
      `UPDATE tournament_rounds tr
       SET starts_at = t.start_date,
           ends_at   = t.start_date + make_interval(mins => t.round_duration_minutes)
       FROM tournaments t
       WHERE t.id = $1
         AND tr.tournament_id = t.id
         AND tr.round_number = t.current_round_number
         AND tr.status = 'active'
         AND t.status IN ('draft', 'open', 'closed')
         AND NOT EXISTS (
           SELECT 1 FROM matches m
           WHERE m.tournament_id = t.id AND m.round_number = tr.round_number
         )`,
      [tournamentId]
    );
  }

  /** Called by the admin edit form after the tournament row itself is updated. */
  async syncOpeningRoundWindow(tournamentId: string) {
    await this.realignOpeningRound(tournamentId);
  }

  /**
   * Open the first round the moment an admin starts a tournament by hand.
   *
   * Starting early otherwise produced a tournament that was live but whose round
   * had not begun — matchmaking waits for an open round, so nothing at all
   * happened until the original start date came round. An admin pressing Start
   * means play begins now.
   */
  async beginOpeningRoundNow(tournamentId: string) {
    await this.pool.query(
      `UPDATE tournament_rounds tr
       SET starts_at = NOW(),
           ends_at   = NOW() + make_interval(mins => t.round_duration_minutes)
       FROM tournaments t
       WHERE t.id = $1
         AND tr.tournament_id = t.id
         AND tr.round_number = t.current_round_number
         AND tr.status = 'active'
         AND (tr.starts_at > NOW() OR tr.ends_at <= NOW())
         AND NOT EXISTS (
           SELECT 1 FROM matches m
           WHERE m.tournament_id = t.id AND m.round_number = tr.round_number
         )`,
      [tournamentId]
    );
  }

  /** Push the fresh registration count to every connected client. */
  async broadcastTournamentUpdate(tournamentId: string, reason: TournamentUpdatedReason) {
    try {
      const countResult = await this.pool.query(
        `SELECT COUNT(*)::int AS count FROM tournament_registrations WHERE tournament_id = $1`,
        [tournamentId]
      );
      emitTournamentUpdated({
        tournamentId,
        reason,
        registrationCount: countResult.rows[0]?.count ?? 0,
      });
    } catch (err) {
      console.error('Failed to broadcast tournament update:', err);
    }
  }

  /**
   * A player may only be live in one tournament at a time — see
   * `isLiveParticipation` for the definition, which this shares with the
   * queue-join check and the `liveTournament` field the tournaments page reads.
   *
   * The previous version matched on participant status alone and ignored
   * whether the tournament had finished. Since completing a tournament left its
   * players sitting at 'active'/'knockout', finishing one locked every player
   * in it out of every future tournament. Migration 14 retires those rows and
   * `complete()` now retires them going forward, so keying off the tournament's
   * status is safe and `idx_one_live_tournament_per_user` still only ever sees
   * one live row per player.
   */
  async assertNoOtherLiveTournament(userId: string, tournamentId: string) {
    await assertNoOtherLiveTournament(this.pool, userId, tournamentId);
  }

  /**
   * The lifecycle sweep flips `status` within a minute of the window closing,
   * so status alone leaves a gap where registration is shut but the row still
   * says 'open'. Checking the timestamps too makes the boundary exact.
   */
  private assertRegistrationWindowOpen(tournament: Tournament) {
    const now = Date.now();
    if (tournament.registrationOpensAt && new Date(tournament.registrationOpensAt).getTime() > now) {
      throw new AppError(
        'CONFLICT',
        `Registration opens ${new Date(tournament.registrationOpensAt).toLocaleString()}`,
        409
      );
    }
    if (
      tournament.registrationClosesAt &&
      new Date(tournament.registrationClosesAt).getTime() <= now
    ) {
      throw new AppError('CONFLICT', 'Registration for this tournament has closed', 409);
    }
  }

  async register(tournamentId: string, userId: string, input: RegisterTournamentInput) {
    const tournament = await this.getById(tournamentId);
    if (tournament.status !== 'open') {
      throw new AppError('CONFLICT', 'Tournament is not open for registration', 409);
    }
    this.assertRegistrationWindowOpen(tournament);

    const userResult = await this.pool.query(
      `SELECT id FROM users WHERE id = $1`,
      [userId]
    );
    if (!userResult.rows[0]) throw new AppError('NOT_FOUND', 'User not found', 404);

    // Cheap pre-check so an obviously-full tournament fails fast; the binding
    // check happens under a lock inside the transaction below, because this one
    // reads a count that every concurrent request sees as pre-insert.
    if (tournament.maxPlayers && (tournament.registrationCount ?? 0) >= tournament.maxPlayers) {
      throw new AppError('CONFLICT', 'Tournament is full', 409);
    }

    await this.assertNoOtherLiveTournament(userId, tournamentId);

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

      // Serialise registrations for this tournament on its own row. Counting
      // outside a lock let every request in a simultaneous burst read the same
      // pre-insert count and pass the capacity check, so a 3-player tournament
      // accepted all 8 of them.
      await client.query(`SELECT id FROM tournaments WHERE id = $1 FOR UPDATE`, [tournamentId]);

      if (tournament.maxPlayers) {
        const taken = await client.query(
          `SELECT COUNT(*)::int AS count FROM tournament_registrations
           WHERE tournament_id = $1 AND user_id <> $2`,
          [tournamentId, userId]
        );
        // `user_id <> $2` so re-registering the same player is still idempotent
        // rather than being rejected by a place they already hold.
        if ((taken.rows[0]?.count ?? 0) >= tournament.maxPlayers) {
          // The catch below rolls back and releases the client.
          throw new AppError('CONFLICT', 'Tournament is full', 409);
        }
      }

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

      await this.broadcastTournamentUpdate(tournamentId, 'registered');

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

  /**
   * Every entry — VR or venue — resolves to exactly one time slot. Without it a
   * VR-vs-VR match was created with no time_slot_id and therefore no window in
   * which either player could play or submit a score.
   */
  private async resolveEntrySlot(
    tournamentId: string,
    userId: string,
    hasVr: boolean,
    roundNumber: number,
    input: EnterTournamentInput
  ) {
    // Fall back to the slot the player used last round so re-entering a new
    // round is one click; an explicit choice always wins.
    let timeSlotId = input.timeSlotId ?? null;
    if (!timeSlotId) {
      const previous = await this.getLatestRoundSlot(tournamentId, userId);
      timeSlotId = previous?.timeSlotId ?? null;
    }
    if (!timeSlotId) {
      throw new AppError(
        'BAD_REQUEST',
        'Pick a time slot for this round before entering',
        400
      );
    }

    const slotResult = await this.pool.query(
      `SELECT ts.*, v.active AS venue_active
       FROM time_slots ts
       JOIN venues v ON v.id = ts.venue_id
       WHERE ts.id = $1`,
      [timeSlotId]
    );
    const slot = slotResult.rows[0];
    if (!slot || !slot.venue_active) {
      throw new AppError('BAD_REQUEST', 'Invalid time slot', 400);
    }

    if (isSlotEnded(slot.end_time)) {
      throw new AppError('BAD_REQUEST', 'That time slot has already ended — pick another', 400);
    }
    // Venue players occupy a physical seat, so they can only take a slot that
    // has not started. VR players may join a slot that is already running.
    if (!hasVr && isSlotStartPast(slot.start_time)) {
      throw new AppError('BAD_REQUEST', 'Cannot book a time slot that has already started', 400);
    }

    const roundWindow = await this.pool.query(
      `SELECT tr.starts_at, tr.ends_at
       FROM tournament_rounds tr
       WHERE tr.tournament_id = $1 AND tr.round_number = $2 AND tr.status = 'active'`,
      [tournamentId, roundNumber]
    );
    const round = roundWindow.rows[0];
    if (round && !isSlotWithinWindow(slot.start_time, slot.end_time, round.starts_at, round.ends_at)) {
      throw new AppError(
        'BAD_REQUEST',
        'Time slot must fall within the current tournament round window',
        400
      );
    }

    if (!hasVr && input.venueId && input.venueId !== slot.venue_id) {
      throw new AppError('BAD_REQUEST', 'Slot does not belong to the selected venue', 400);
    }

    return {
      slotId: slot.id as string,
      venueId: slot.venue_id as string,
      startTime: slot.start_time as Date,
      endTime: slot.end_time as Date,
    };
  }

  /** Reuse an existing confirmed booking rather than failing on re-entry. */
  private async ensureBooking(userId: string, timeSlotId: string) {
    const existing = await this.pool.query(
      `SELECT * FROM bookings
       WHERE user_id = $1 AND time_slot_id = $2 AND status = 'confirmed'`,
      [userId, timeSlotId]
    );
    if (existing.rows[0]) return mapBooking(existing.rows[0]);

    const bookingsService = new BookingsService(this.pool, this.redis!);
    return bookingsService.create(userId, timeSlotId);
  }

  async enter(
    tournamentId: string,
    userId: string,
    input: EnterTournamentInput
  ): Promise<EnterTournamentResult> {
    if (!this.redis) throw new AppError('INTERNAL', 'Redis not configured', 500);

    const tournament = await this.getById(tournamentId);
    // 'closed' is the gap between registration shutting and play starting. New
    // entrants are turned away below, but a player who is already registered has
    // to be able to pick their play window in it — otherwise the one stretch of
    // time when they know they are in the tournament and know when it starts is
    // the one stretch when the system will not let them prepare for it, and they
    // arrive at the first round with nothing for matchmaking to schedule.
    if (!['open', 'closed', 'in_progress'].includes(tournament.status)) {
      throw new AppError('CONFLICT', 'Tournament is not accepting entries', 409);
    }

    const userResult = await this.pool.query(
      `SELECT has_vr_headset FROM users WHERE id = $1`,
      [userId]
    );
    const user = userResult.rows[0];
    if (!user) throw new AppError('NOT_FOUND', 'User not found', 404);
    const hasVr: boolean = user.has_vr_headset;

    const existingReg = await this.getRegistration(tournamentId, userId);

    // New entrants may only join while registration is open; already-registered
    // players keep entering later rounds after the tournament has started.
    if (!existingReg) {
      if (tournament.status !== 'open') {
        throw new AppError(
          'CONFLICT',
          'Registration for this tournament has closed — you can no longer join',
          409
        );
      }
      // Entering as a new player registers them, so the registration window
      // applies here too. Players already registered keep entering later rounds.
      this.assertRegistrationWindowOpen(tournament);
      await this.assertNoOtherLiveTournament(userId, tournamentId);
    }

    const existingParticipant = await this.getParticipant(tournamentId, userId);
    if (existingParticipant && !['active', 'advanced'].includes(existingParticipant.status)) {
      throw new AppError('FORBIDDEN', 'You are eliminated from this tournament', 403);
    }

    const roundNumber = existingParticipant?.roundNumber ?? tournament.currentRoundNumber ?? 1;
    const slot = await this.resolveEntrySlot(tournamentId, userId, hasVr, roundNumber, input);

    // VR players play from home: they own the play window but take no venue seat.
    const booking = hasVr ? null : await this.ensureBooking(userId, slot.slotId);
    const bookingId = booking?.id ?? null;
    const preferredVenueId = hasVr ? null : slot.venueId;

    const registration = existingReg
      ? existingReg
      : await this.register(tournamentId, userId, { bookingId: bookingId ?? undefined });

    if (existingReg && bookingId && existingReg.bookingId !== bookingId) {
      await this.pool.query(
        `UPDATE tournament_registrations SET booking_id = $1
         WHERE tournament_id = $2 AND user_id = $3`,
        [bookingId, tournamentId, userId]
      );
    }

    const roundSlot = await this.saveRoundSlot({
      tournamentId,
      userId,
      roundNumber,
      timeSlotId: slot.slotId,
      venueId: preferredVenueId,
      bookingId,
    });

    await removeFromQueue(this.redis, userId);
    await requeuePlayer(this.pool, this.redis, userId, {
      tournamentId,
      preferredVenueId,
      roundNumber,
      bookingId,
      slotId: slot.slotId,
      slotStartAt: new Date(slot.startTime).getTime(),
      slotEndAt: new Date(slot.endTime).getTime(),
    }, this.env);

    await this.broadcastTournamentUpdate(tournamentId, existingReg ? 'entered' : 'registered');

    return {
      registration,
      booking,
      roundSlot,
      searching: true,
    };
  }

  private async saveRoundSlot(input: {
    tournamentId: string;
    userId: string;
    roundNumber: number;
    timeSlotId: string;
    venueId: string | null;
    bookingId: string | null;
  }): Promise<TournamentRoundSlot> {
    const result = await this.pool.query(
      `INSERT INTO tournament_round_slots
         (tournament_id, user_id, round_number, time_slot_id, venue_id, booking_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (tournament_id, user_id, round_number) DO UPDATE
         SET time_slot_id = EXCLUDED.time_slot_id,
             venue_id = EXCLUDED.venue_id,
             booking_id = EXCLUDED.booking_id,
             updated_at = NOW()
       RETURNING *`,
      [
        input.tournamentId,
        input.userId,
        input.roundNumber,
        input.timeSlotId,
        input.venueId,
        input.bookingId,
      ]
    );
    return mapRoundSlotRow(result.rows[0]);
  }

  /** The slot chosen for a specific round, or null when none was chosen yet. */
  async getRoundSlot(
    tournamentId: string,
    userId: string,
    roundNumber: number
  ): Promise<TournamentRoundSlot | null> {
    const result = await this.pool.query(
      `${ROUND_SLOT_SELECT}
       WHERE rs.tournament_id = $1 AND rs.user_id = $2 AND rs.round_number = $3`,
      [tournamentId, userId, roundNumber]
    );
    return result.rows[0] ? mapRoundSlotRow(result.rows[0]) : null;
  }

  /** Most recent slot the player picked in this tournament — the default for the next round. */
  async getLatestRoundSlot(
    tournamentId: string,
    userId: string
  ): Promise<TournamentRoundSlot | null> {
    const result = await this.pool.query(
      `${ROUND_SLOT_SELECT}
       WHERE rs.tournament_id = $1 AND rs.user_id = $2
       ORDER BY rs.round_number DESC
       LIMIT 1`,
      [tournamentId, userId]
    );
    return result.rows[0] ? mapRoundSlotRow(result.rows[0]) : null;
  }

  /**
   * What the player sees on the slot step. VR players get every slot in the
   * round window across active venues (they only need a time); venue players
   * get the slots of the venue they picked.
   */
  async getSlotOptions(tournamentId: string, userId: string, query: TournamentSlotOptionsQuery) {
    const tournament = await this.getById(tournamentId);

    const userResult = await this.pool.query(
      `SELECT has_vr_headset FROM users WHERE id = $1`,
      [userId]
    );
    if (!userResult.rows[0]) throw new AppError('NOT_FOUND', 'User not found', 404);
    const hasVr: boolean = userResult.rows[0].has_vr_headset;

    const participant = await this.getParticipant(tournamentId, userId);
    const roundNumber = participant?.roundNumber ?? tournament.currentRoundNumber ?? 1;

    const roundResult = await this.pool.query(
      `SELECT starts_at, ends_at FROM tournament_rounds
       WHERE tournament_id = $1 AND round_number = $2 AND status = 'active'`,
      [tournamentId, roundNumber]
    );
    const round = roundResult.rows[0] ?? null;

    const params: unknown[] = [query.date];
    let where = `v.active = TRUE
      AND ts.start_time >= $1::date
      AND ts.start_time < ($1::date + INTERVAL '1 day')
      AND ts.end_time > NOW()`;

    if (!hasVr) {
      // Venue players need a seat, so only slots that have not started yet.
      where += ` AND ts.start_time > NOW()`;
      if (query.venueId) {
        params.push(query.venueId);
        where += ` AND ts.venue_id = $${params.length}`;
      }
    }

    if (round) {
      params.push(round.starts_at, round.ends_at);
      where += ` AND ts.start_time >= $${params.length - 1} AND ts.end_time <= $${params.length}`;
    }

    const result = await this.pool.query(
      `SELECT ts.*, v.name AS venue_name, v.city AS venue_city, v.address AS venue_address
       FROM time_slots ts
       JOIN venues v ON v.id = ts.venue_id
       WHERE ${where}
       ORDER BY ts.start_time ASC, v.name ASC`,
      params
    );

    const previous = await this.getLatestRoundSlot(tournamentId, userId);

    let rows = result.rows;
    if (hasVr) {
      // A VR player picks a time, not a seat, so identical windows offered by
      // several venues would just be duplicate rows. Keep one per window, and
      // prefer the one they already hold so it stays selectable.
      const byWindow = new Map<string, (typeof rows)[number]>();
      for (const row of rows) {
        const key = `${new Date(row.start_time).getTime()}-${new Date(row.end_time).getTime()}`;
        if (!byWindow.has(key) || row.id === previous?.timeSlotId) {
          byWindow.set(key, row);
        }
      }
      rows = [...byWindow.values()].sort(
        (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );
    }

    return {
      roundNumber,
      requiresVenue: !hasVr,
      round: round
        ? { startsAt: round.starts_at.toISOString(), endsAt: round.ends_at.toISOString() }
        : null,
      defaultTimeSlotId: previous?.timeSlotId ?? null,
      previousSlot: previous,
      slots: rows.map((row) => ({
        ...mapSlot(row),
        venue: {
          id: row.venue_id,
          name: row.venue_name,
          city: row.venue_city,
          address: row.venue_address,
        },
      })),
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

  private async assertBuybackAllowed(tournamentId: string, tournament: Tournament) {
    const activeCountResult = await this.pool.query(
      `SELECT COUNT(*)::int AS count FROM tournament_participants
       WHERE tournament_id = $1 AND status IN ('active', 'advanced')`,
      [tournamentId]
    );
    const activeCount = activeCountResult.rows[0]?.count ?? 0;
    const fieldSize = resolveFieldSize(tournament.initialPlayerCount, activeCount);
    if (shouldStartKnockout(activeCount, fieldSize)) {
      throw new AppError(
        'CONFLICT',
        'Buybacks are closed — knockout begins when half the field or fewer remain',
        409
      );
    }
  }

  /**
   * The subset of the checkout preconditions that can still change between
   * paying and the webhook arriving. Throwing here leaves the buyback pending
   * and the webhook 4xx's, so Stripe retries and the payment stays visible for
   * a refund rather than silently buying a place in a finished tournament.
   */
  private async assertBuybackStillFulfillable(tournamentId: string, roundNumber: number) {
    const tournament = await this.getById(tournamentId);
    if (tournament.status === 'completed' || tournament.phase === 'completed') {
      throw new AppError('CONFLICT', 'Tournament has ended — this buyback cannot be applied', 409);
    }
    if (tournament.phase !== 'normal') {
      throw new AppError(
        'CONFLICT',
        'Knockout has started — this buyback cannot be applied',
        409
      );
    }

    const roundOpen = await this.pool.query(
      `SELECT id FROM tournament_rounds
       WHERE tournament_id = $1 AND round_number = $2 AND status = 'active' AND ends_at > NOW()`,
      [tournamentId, roundNumber]
    );
    if (!roundOpen.rows[0]) {
      throw new AppError('CONFLICT', 'Round has ended — this buyback cannot be applied', 409);
    }
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
    // Two statuses mean "no longer competing": `eliminated` is losing a match,
    // `out` is missing the cut when a round closed. Only the first was accepted,
    // so a player knocked out by the standings — through no decision of their
    // own — was told buybacks were for eliminated players only.
    //
    // `out` also marks a player who withdrew, and withdrawing deletes the
    // registration, so requiring one is what keeps them from buying back into a
    // tournament they left.
    if (!['eliminated', 'out'].includes(participant.status)) {
      throw new AppError('CONFLICT', 'Only players who are out of the tournament can buy back', 409);
    }
    const registration = await this.getRegistration(tournamentId, userId);
    if (!registration) {
      throw new AppError('FORBIDDEN', 'Not registered for this tournament', 403);
    }

    await this.assertBuybackAllowed(tournamentId, tournament);

    // Buy back into the round that is running now, not the one the player went
    // out in. Only a match loser is still in the current round; a player cut at
    // a round close carries the closed round's number, and checking that always
    // answered "round time has ended" — so the cut was unbuyable-back by
    // construction.
    const buybackRound = tournament.currentRoundNumber ?? participant.roundNumber;

    const roundOpen = await this.pool.query(
      `SELECT id FROM tournament_rounds
       WHERE tournament_id = $1 AND round_number = $2 AND status = 'active' AND ends_at > NOW()`,
      [tournamentId, buybackRound]
    );
    if (!roundOpen.rows[0]) {
      throw new AppError('CONFLICT', 'Round time has ended — buybacks are no longer available', 409);
    }

    return createBuybackPaymentIntent(this.env, this.pool, {
      userId,
      tournamentId,
      roundNumber: buybackRound,
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
    if (buyback.status === 'failed') {
      throw new AppError('CONFLICT', 'Buyback payment failed', 409);
    }
    if (!buyback.stripe_payment_intent_id) {
      throw new AppError('BAD_REQUEST', 'Buyback must be paid via Stripe', 400);
    }

    const tournamentId = buyback.tournament_id;
    const userId = buyback.user_id;

    // Checkout validated the tournament phase and round, but the payment can
    // land minutes later — by which time the round may have closed, knockout
    // may have started, or the tournament may be over. Re-check at the moment
    // the buyback is actually granted, or the player is re-activated into a
    // phase that no longer exists.
    await this.assertBuybackStillFulfillable(tournamentId, buyback.round_number);

    const reg = await this.getRegistration(tournamentId, userId);
    const roundSlot = await this.getLatestRoundSlot(tournamentId, userId);
    const preferredVenueId = roundSlot?.venueId ?? null;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Take the row lock first, then re-test the status under it. Stripe
      // retries and can deliver the same event twice concurrently; without
      // this both deliveries passed the unlocked check above and each added a
      // buyback, so the player got two re-entries for one payment.
      const locked = await client.query(
        `SELECT status FROM buybacks WHERE id = $1 FOR UPDATE`,
        [buybackId]
      );
      if (locked.rows[0]?.status !== 'pending') {
        await client.query('ROLLBACK');
        const settled = await this.pool.query(`SELECT * FROM buybacks WHERE id = $1`, [buybackId]);
        return mapBuyback(settled.rows[0]);
      }

      await client.query(
        `UPDATE buybacks SET status = 'completed' WHERE id = $1 AND status = 'pending'`,
        [buybackId]
      );

      // The round number moves with them. A player cut at a round close still
      // carries the closed round's number, and enrolment only ever re-queues
      // participants sitting in the tournament's current round — so leaving it
      // behind meant a Redis restart would drop them out of matchmaking for
      // good, with the buyback already paid for.
      await client.query(
        `UPDATE tournament_participants
         SET status = 'active', round_number = $3, buyback_count = buyback_count + 1,
             updated_at = NOW()
         WHERE tournament_id = $1 AND user_id = $2`,
        [tournamentId, userId, buyback.round_number]
      );

      await client.query('COMMIT');

      await requeuePlayer(this.pool, this.redis, userId, {
        tournamentId,
        roundNumber: buyback.round_number,
        preferredVenueId,
        bookingId: roundSlot?.bookingId ?? reg?.bookingId ?? null,
        slotId: roundSlot?.timeSlotId ?? null,
        slotStartAt: roundSlot?.slot ? new Date(roundSlot.slot.startTime).getTime() : null,
        slotEndAt: roundSlot?.slot ? new Date(roundSlot.slot.endTime).getTime() : null,
      }, this.env);

      await this.broadcastTournamentUpdate(tournamentId, 'entered');

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

      // Release the reserved play windows so the player is free to enter another
      // tournament and the slots go back on offer.
      await client.query(
        `DELETE FROM tournament_round_slots WHERE tournament_id = $1 AND user_id = $2`,
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
        // A score on the board is what makes the opponent's innings real — not
        // the match having reached `in_progress`. A chase carries the setter's
        // solo innings from the moment it is created, while the match sits at
        // `confirmed` until the chaser submits: gating on the status alone
        // cancelled those matches and threw away an innings that had been played.
        const otherBatted = otherScore != null;

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

      await this.broadcastTournamentUpdate(tournamentId, 'withdrawn');

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
        phase: tournament.phase,
        fieldSize: tournament.initialPlayerCount,
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
      phase: tournament.phase,
      fieldSize: tournament.initialPlayerCount,
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
    let openedBracketMatches: Array<{ matchId: string; player1Id: string; player2Id: string }> = [];
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

      // A match still open in this round can never be scored once the round
      // shuts — `assertMatchSlotPlayable` refuses it — and while it stays open
      // the `hasActiveMatch` guard keeps both players out of the next round.
      await settleOpenMatches(client, tournamentId, roundNumber);

      const tournamentResult = await client.query(
        `SELECT initial_player_count, round_duration_minutes FROM tournaments WHERE id = $1`,
        [tournamentId]
      );
      const tournamentRow = tournamentResult.rows[0];
      const roundDurationMinutes = tournamentRow?.round_duration_minutes ?? 180;

      const activeResult = await client.query(
        `SELECT tp.*, tr.registered_at FROM tournament_participants tp
         JOIN tournament_registrations tr ON tr.tournament_id = tp.tournament_id AND tr.user_id = tp.user_id
         WHERE tp.tournament_id = $1 AND tp.status IN ('active', 'advanced')
         ORDER BY tp.wins DESC, tp.losses ASC, tr.registered_at ASC`,
        [tournamentId]
      );

      const active = activeResult.rows;
      const activeCount = active.length;
      let fieldSize = resolveFieldSize(tournamentRow?.initial_player_count, activeCount);

      if (!tournamentRow?.initial_player_count && activeCount > 0) {
        await client.query(
          `UPDATE tournaments SET initial_player_count = $1, updated_at = NOW() WHERE id = $2`,
          [activeCount, tournamentId]
        );
        fieldSize = activeCount;
      }

      if (shouldStartKnockout(activeCount, fieldSize)) {
        openedBracketMatches = await this.generateKnockoutBracket(client, tournamentId, active);
        await client.query(
          `UPDATE tournaments SET phase = 'knockout', updated_at = NOW() WHERE id = $1`,
          [tournamentId]
        );
      } else {
        const keepCount = playersToAdvance(activeCount, fieldSize);
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
        const nextEnds = new Date(nextStarts.getTime() + roundDurationMinutes * 60_000);

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
      for (const m of openedBracketMatches) {
        await this.announceBracketMatch(m.matchId, m.player1Id, m.player2Id);
      }
      await this.broadcastTournamentUpdate(tournamentId, 'round_closed');
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
  ): Promise<Array<{ matchId: string; player1Id: string; player2Id: string }>> {
    const opened: Array<{ matchId: string; player1Id: string; player2Id: string }> = [];
    const sorted = players;
    for (const p of sorted) {
      await client.query(
        `UPDATE tournament_participants SET status = 'knockout', updated_at = NOW()
         WHERE tournament_id = $1 AND user_id = $2`,
        [tournamentId, p.user_id]
      );
    }

    // `knockoutDraw` sizes the round to the field and gives an odd player out a
    // bye. Taking `firstKnockoutMatchCount` slots instead simply left them out
    // of the draw, with no match to play and no way to reach the next round.
    const { roundNumber, pairs } = knockoutDraw(sorted.map((p) => p.user_id));
    for (const [slot, [p1, p2]] of pairs.entries()) {
      // Confirmed on creation: a bracket match has no confirmation step to
      // wait for, and one left pending was expired by the five-minute sweep
      // before either player could reach it — the headset never even shows an
      // unconfirmed match.
      const created = await client.query(
        `INSERT INTO matches (tournament_id, player1_id, player2_id, status, round_number, phase, bracket_slot)
         VALUES ($1, $2, $3, 'confirmed', $4, 'knockout', $5)
         RETURNING id`,
        [tournamentId, p1, p2, roundNumber, slot]
      );
      opened.push({ matchId: created.rows[0].id, player1Id: p1, player2Id: p2 });
    }

    return opened;
  }

  /** Tell both players a bracket match is open; nothing else announces one. */
  private async announceBracketMatch(matchId: string, player1Id: string, player2Id: string) {
    const users = await this.pool.query(
      `SELECT id, username, skill_tier FROM users WHERE id = ANY($1)`,
      [[player1Id, player2Id]]
    );
    const byId = new Map(users.rows.map((u) => [u.id, u]));

    for (const [playerId, opponentId] of [
      [player1Id, player2Id],
      [player2Id, player1Id],
    ] as const) {
      const opponent = byId.get(opponentId);
      const payload = {
        matchId,
        opponent: {
          id: opponentId,
          username: opponent?.username ?? 'Unknown',
          skillTier: opponent?.skill_tier ?? 3,
        },
        chaseTarget: null,
        amChasing: false,
        autoConfirmed: true,
        confirmDeadline: null,
      };
      emitToUser(playerId, 'match:found', payload);
      if (this.env) {
        enqueueNotification(this.env, {
          userId: playerId,
          type: 'match_found',
          channels: ['in_app', 'email'],
          payload,
          idempotencyKey: `match-found:${matchId}:${playerId}`,
        }).catch(console.error);
      }
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

    const col = isPlayer1 ? 'player1_id' : 'player2_id';

    // Both feeder matches can resolve at the same instant, and each one used to
    // read "no next-round match yet" and insert its own — splitting the bracket
    // into two half-empty finals. Let the unique index arbitrate: whoever
    // inserts first wins, the other falls through to filling in its own side.
    const inserted = await this.pool.query(
      `INSERT INTO matches (tournament_id, player1_id, player2_id, status, round_number, phase, bracket_slot)
       VALUES ($1, $2, $3, 'pending_confirmation', $4, 'knockout', $5)
       ON CONFLICT (tournament_id, round_number, bracket_slot)
         WHERE phase = 'knockout' AND bracket_slot IS NOT NULL
       DO NOTHING
       RETURNING id`,
      [
        match.tournament_id,
        isPlayer1 ? winnerId : null,
        isPlayer1 ? null : winnerId,
        nextRound,
        nextSlot,
      ]
    );

    // A slot with only one side known has to stay `pending_confirmation` —
    // `matches_players_present` permits a half-empty match in no other state —
    // so it is announced only once the other feeder fills it in below.
    if (inserted.rows[0]) return;

    // The slot already existed (or the concurrent insert beat us to it): claim
    // our half of it without disturbing the other side. Filling the last empty
    // side opens the match, so it is confirmed here — left pending, the
    // five-minute sweep expired it within the next 30 seconds, because the slot
    // was created when the *first* feeder resolved and is long past that age by
    // the time the second one lands.
    const filled = await this.pool.query(
      `UPDATE matches SET ${col} = $1,
              status = CASE WHEN ${col === 'player1_id' ? 'player2_id' : 'player1_id'} IS NOT NULL
                            THEN 'confirmed' ELSE status END,
              updated_at = NOW()
       WHERE tournament_id = $2 AND round_number = $3 AND bracket_slot = $4
         AND phase = 'knockout'
       RETURNING id, player1_id, player2_id, status`,
      [winnerId, match.tournament_id, nextRound, nextSlot]
    );

    const row = filled.rows[0];
    if (row?.status === 'confirmed' && row.player1_id && row.player2_id) {
      await this.announceBracketMatch(row.id, row.player1_id, row.player2_id);
    }
  }
}
