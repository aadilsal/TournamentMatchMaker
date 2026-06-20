import type { Pool } from 'pg';
import type { DeclineMatchInput, SubmitScoreInput, Match } from '@vr-tournament/shared';
import type { RedisClient } from '../../lib/redis.js';
import type { Env } from '../../config/env.js';
import { mapMatch } from '../../lib/mappers.js';
import { AppError } from '../../lib/response.js';
import {
  finalizeMatchSlotBookings,
  releaseSlotLock,
  SLOT_LOCK_TTL_SEC,
} from '../../lib/slot-lock.js';
import { matchConfirmKey } from '../../lib/queue-keys.js';
import { enqueueNotification } from '../../lib/bullmq.js';
import { requeuePlayer, removeFromQueue } from '../../lib/requeue-player.js';
import { updateUserRating } from '../../lib/rating.js';
import { TournamentsService } from '../tournaments/tournaments.service.js';

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

export class MatchesService {
  private tournamentsService: TournamentsService;

  constructor(
    private pool: Pool,
    private redis: RedisClient,
    private env?: Env
  ) {
    this.tournamentsService = new TournamentsService(pool, redis, env);
  }

  private async attachConfirmations(match: Match): Promise<Match> {
    if (match.status !== 'pending_confirmation') {
      return { ...match, confirmations: null };
    }

    const confirms = await this.redis.hgetall(matchConfirmKey(match.id));
    return {
      ...match,
      confirmations: {
        player1Confirmed: confirms[match.player1Id] === '1',
        player2Confirmed: confirms[match.player2Id] === '1',
      },
    };
  }

  async getById(matchId: string, userId?: string) {
    const result = await this.pool.query(`${MATCH_SELECT} WHERE m.id = $1`, [matchId]);
    const row = result.rows[0];
    if (!row) throw new AppError('NOT_FOUND', 'Match not found', 404);

    if (userId && row.player1_id !== userId && row.player2_id !== userId) {
      throw new AppError('FORBIDDEN', 'Not a participant in this match', 403);
    }

    return this.attachConfirmations(mapMatch(row));
  }

  async listByUser(userId: string) {
    const result = await this.pool.query(
      `${MATCH_SELECT}
       WHERE m.player1_id = $1 OR m.player2_id = $1
       ORDER BY m.created_at DESC
       LIMIT 50`,
      [userId]
    );
    return Promise.all(result.rows.map((row) => this.attachConfirmations(mapMatch(row))));
  }

  async confirm(matchId: string, userId: string) {
    const confirmKey = matchConfirmKey(matchId);
    let recordedConfirm = false;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const matchResult = await client.query(
        `${MATCH_SELECT} WHERE m.id = $1 FOR UPDATE OF m`,
        [matchId]
      );
      const match = matchResult.rows[0];
      if (!match) throw new AppError('NOT_FOUND', 'Match not found', 404);
      if (match.player1_id !== userId && match.player2_id !== userId) {
        throw new AppError('FORBIDDEN', 'Not a participant', 403);
      }
      if (match.status !== 'pending_confirmation') {
        throw new AppError('CONFLICT', 'Match is not awaiting confirmation', 409);
      }

      const existingConfirms = await this.redis.hgetall(confirmKey);
      if (existingConfirms[userId] === '1') {
        await client.query('COMMIT');
        return this.getById(matchId, userId);
      }

      await this.redis.hset(confirmKey, userId, '1');
      await this.redis.expire(confirmKey, SLOT_LOCK_TTL_SEC);
      recordedConfirm = true;

      const confirms = await this.redis.hgetall(confirmKey);
      const p1Confirmed = confirms[match.player1_id] === '1';
      const p2Confirmed = confirms[match.player2_id] === '1';

      if (p1Confirmed && p2Confirmed) {
        if (match.time_slot_id) {
          await finalizeMatchSlotBookings(client, this.redis, match.time_slot_id, [
            match.player1_id,
            match.player2_id,
          ]);
        }

        await client.query(
          `UPDATE matches SET status = 'confirmed', updated_at = NOW() WHERE id = $1`,
          [matchId]
        );
        await this.redis.del(confirmKey);

        if (this.env) {
          for (const uid of [match.player1_id, match.player2_id]) {
            await enqueueNotification(this.env, {
              userId: uid,
              type: 'match_confirmed',
              channels: ['in_app', 'email'],
              payload: { matchId, venueId: match.venue_id, slotId: match.time_slot_id },
              idempotencyKey: `match-confirmed:${matchId}:${uid}`,
            });
          }
        }
      }

      await client.query('COMMIT');
      return this.getById(matchId, userId);
    } catch (err) {
      await client.query('ROLLBACK');
      if (recordedConfirm) {
        await this.redis.hdel(confirmKey, userId);
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async decline(matchId: string, userId: string, input: DeclineMatchInput) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const matchResult = await client.query(
        `SELECT * FROM matches WHERE id = $1 FOR UPDATE`,
        [matchId]
      );
      const match = matchResult.rows[0];
      if (!match) throw new AppError('NOT_FOUND', 'Match not found', 404);
      if (match.player1_id !== userId && match.player2_id !== userId) {
        throw new AppError('FORBIDDEN', 'Not a participant', 403);
      }
      if (!['pending_confirmation', 'confirmed'].includes(match.status)) {
        throw new AppError('CONFLICT', 'Match cannot be declined', 409);
      }

      await client.query(
        `UPDATE matches SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
        [matchId]
      );

      await releaseSlotLock(this.pool, this.redis, match.time_slot_id);
      await this.redis.del(matchConfirmKey(matchId));

      const otherPlayer =
        match.player1_id === userId ? match.player2_id : match.player1_id;

      if (input.requeue) {
        const meta = await this.redis.hgetall(`queue:player:${otherPlayer}`);
        await requeuePlayer(this.pool, this.redis, otherPlayer, {
          tournamentId: match.tournament_id,
          preferredVenueId: meta.preferredVenueId || null,
        }, this.env);
      }

      await client.query('COMMIT');

      if (this.env) {
        await enqueueNotification(this.env, {
          userId: otherPlayer,
          type: 'match_declined',
          channels: ['in_app', 'email'],
          payload: { matchId },
          idempotencyKey: `match-declined:${matchId}:${otherPlayer}`,
        });
      }

      return mapMatch({ ...match, status: 'cancelled' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async submitScore(matchId: string, userId: string, input: SubmitScoreInput) {
    const client = await this.pool.connect();
    let completedWinnerId: string | null = null;
    let completedLoserId: string | null = null;
    let tournamentId: string | null = null;
    let matchPhase: string | null = null;
    let winnerNextRound: number | null = null;
    let requeueMeta: {
      preferredVenueId: string | null;
      bookingId: string | null;
    } = { preferredVenueId: null, bookingId: null };

    try {
      await client.query('BEGIN');

      const matchResult = await client.query(
        `SELECT * FROM matches WHERE id = $1 FOR UPDATE`,
        [matchId]
      );
      const match = matchResult.rows[0];
      if (!match) throw new AppError('NOT_FOUND', 'Match not found', 404);
      if (match.player1_id !== userId && match.player2_id !== userId) {
        throw new AppError('FORBIDDEN', 'Not a participant', 403);
      }
      if (!['confirmed', 'in_progress'].includes(match.status)) {
        throw new AppError('CONFLICT', 'Match is not currently playable', 409);
      }

      const isPlayer1 = match.player1_id === userId;
      const current = (match.result ?? { player1Score: null, player2Score: null, winnerId: null }) as {
        player1Score: number | null;
        player2Score: number | null;
        winnerId: string | null;
      };

      if (isPlayer1 && current.player1Score !== null) {
        throw new AppError('CONFLICT', 'You have already submitted your score', 409);
      }
      if (!isPlayer1 && current.player2Score !== null) {
        throw new AppError('CONFLICT', 'You have already submitted your score', 409);
      }

      const updated = {
        player1Score: isPlayer1 ? input.score : current.player1Score,
        player2Score: isPlayer1 ? current.player2Score : input.score,
        winnerId: null as string | null,
      };

      let newStatus = 'in_progress';

      if (updated.player1Score !== null && updated.player2Score !== null) {
        newStatus = 'completed';
        if (updated.player1Score > updated.player2Score) {
          updated.winnerId = match.player1_id;
        } else if (updated.player2Score > updated.player1Score) {
          updated.winnerId = match.player2_id;
        }
      }

      await client.query(
        `UPDATE matches SET result = $1, status = $2, updated_at = NOW() WHERE id = $3`,
        [JSON.stringify(updated), newStatus, matchId]
      );

      if (newStatus === 'completed' && updated.winnerId) {
        const winnerId = updated.winnerId;
        const loserId = winnerId === match.player1_id ? match.player2_id : match.player1_id;
        completedWinnerId = winnerId;
        completedLoserId = loserId;
        tournamentId = match.tournament_id;
        matchPhase = match.phase;

        await updateUserRating(client, winnerId, true);
        await updateUserRating(client, loserId, false);

        if (match.tournament_id && match.phase === 'normal') {
          const winnerParticipant = await client.query(
            `SELECT round_number FROM tournament_participants
             WHERE tournament_id = $1 AND user_id = $2 FOR UPDATE`,
            [match.tournament_id, winnerId]
          );
          const currentRound = winnerParticipant.rows[0]?.round_number ?? 1;
          winnerNextRound = currentRound + 1;

          await client.query(
            `UPDATE tournament_participants
             SET wins = wins + 1, round_number = $1, status = 'active', updated_at = NOW()
             WHERE tournament_id = $2 AND user_id = $3`,
            [winnerNextRound, match.tournament_id, winnerId]
          );
          await client.query(
            `UPDATE tournament_participants
             SET losses = losses + 1, status = 'eliminated', updated_at = NOW()
             WHERE tournament_id = $1 AND user_id = $2`,
            [match.tournament_id, loserId]
          );

          const reg = await client.query(
            `SELECT booking_id FROM tournament_registrations
             WHERE tournament_id = $1 AND user_id = $2`,
            [match.tournament_id, winnerId]
          );
          const bookingId = reg.rows[0]?.booking_id ?? null;
          let preferredVenueId: string | null = null;
          if (bookingId) {
            const venueRow = await client.query(
              `SELECT ts.venue_id FROM bookings b
               JOIN time_slots ts ON ts.id = b.time_slot_id WHERE b.id = $1`,
              [bookingId]
            );
            preferredVenueId = venueRow.rows[0]?.venue_id ?? null;
          }
          requeueMeta = { preferredVenueId, bookingId };
        } else if (match.tournament_id && match.phase === 'knockout') {
          // Knockout participant stats handled via bracket advancement
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    if (completedWinnerId && tournamentId) {
      if (matchPhase === 'knockout') {
        await this.tournamentsService.advanceKnockoutWinner(matchId, completedWinnerId);
      } else if (winnerNextRound !== null) {
        await requeuePlayer(this.pool, this.redis, completedWinnerId, {
          tournamentId,
          roundNumber: winnerNextRound,
          preferredVenueId: requeueMeta.preferredVenueId,
          bookingId: requeueMeta.bookingId,
        }, this.env);
      }

      if (this.env) {
        enqueueNotification(this.env, {
          userId: completedWinnerId,
          type: 'match_won',
          channels: ['in_app'],
          payload: { matchId },
          idempotencyKey: `match-won:${matchId}:${completedWinnerId}`,
        }).catch(console.error);
        if (completedLoserId) {
          enqueueNotification(this.env, {
            userId: completedLoserId,
            type: 'match_lost',
            channels: ['in_app'],
            payload: { matchId, tournamentId },
            idempotencyKey: `match-lost:${matchId}:${completedLoserId}`,
          }).catch(console.error);
        }
      }
    }

    if (completedLoserId && tournamentId && matchPhase === 'normal') {
      await removeFromQueue(this.redis, completedLoserId);
    }

    return this.getById(matchId, userId);
  }
}
