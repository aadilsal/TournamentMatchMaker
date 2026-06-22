import type { Pool } from 'pg';
import type { RedisClient } from './redis.js';
import type { Env } from '../config/env.js';
import type { MatchResultExtended } from '@vr-tournament/shared';
import {
  resolveMatchOutcome,
  winnerIdFromOutcome,
} from '@vr-tournament/shared';
import { updateUserRating } from './rating.js';
import { requeuePlayer, removeFromQueue } from './requeue-player.js';
import { enqueueNotification } from './bullmq.js';
import { TournamentsService } from '../modules/tournaments/tournaments.service.js';
import { emitMatchUpdated } from '../socket/sync-events.js';
import { AppError } from './response.js';

export async function applyMatchOutcome(
  pool: Pool,
  redis: RedisClient,
  env: Env | undefined,
  matchId: string,
  match: {
    player1_id: string;
    player2_id: string;
    tournament_id: string | null;
    phase: string | null;
    round_number: number | null;
    time_slot_id: string | null;
  },
  result: MatchResultExtended,
  player1Score: number,
  player2Score: number
): Promise<{ status: string; result: MatchResultExtended }> {
  const outcome = resolveMatchOutcome(
    match.player1_id,
    match.player2_id,
    player1Score,
    player2Score,
    result
  );

  if (outcome === 'incomplete') {
    return { status: 'in_progress', result };
  }

  if (outcome === 'rematch') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE matches SET status = 'cancelled', result = $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify({ ...result, player1Score, player2Score, outcome: 'rematch' }), matchId]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    if (match.tournament_id) {
      const roundNumber = match.round_number ?? 1;
      for (const userId of [match.player1_id, match.player2_id]) {
        const reg = await pool.query(
          `SELECT booking_id FROM tournament_registrations WHERE tournament_id = $1 AND user_id = $2`,
          [match.tournament_id, userId]
        );
        let preferredVenueId: string | null = null;
        const bookingId = reg.rows[0]?.booking_id ?? null;
        if (bookingId) {
          const v = await pool.query(
            `SELECT ts.venue_id FROM bookings b JOIN time_slots ts ON ts.id = b.time_slot_id WHERE b.id = $1`,
            [bookingId]
          );
          preferredVenueId = v.rows[0]?.venue_id ?? null;
        }
        await requeuePlayer(pool, redis, userId, {
          tournamentId: match.tournament_id,
          roundNumber,
          preferredVenueId,
          bookingId,
        }, env);
      }
    }

    emitMatchUpdated([match.player1_id, match.player2_id], {
      matchId,
      status: 'cancelled',
    });

    return {
      status: 'cancelled',
      result: { ...result, player1Score, player2Score, outcome: 'rematch' },
    };
  }

  const winnerId = winnerIdFromOutcome(outcome, match.player1_id, match.player2_id)!;
  const loserId = winnerId === match.player1_id ? match.player2_id : match.player1_id;
  const finalResult: MatchResultExtended = {
    ...result,
    player1Score,
    player2Score,
    winnerId,
    outcome: 'win',
    source: result.source ?? 'meta',
  };

  const client = await pool.connect();
  let winnerNextRound: number | null = null;
  let requeueMeta = { preferredVenueId: null as string | null, bookingId: null as string | null };

  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE matches SET result = $1, status = 'completed', updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(finalResult), matchId]
    );

    await updateUserRating(client, winnerId, true);
    await updateUserRating(client, loserId, false);

    if (match.tournament_id && match.phase === 'normal') {
      const wp = await client.query(
        `SELECT round_number FROM tournament_participants
         WHERE tournament_id = $1 AND user_id = $2 FOR UPDATE`,
        [match.tournament_id, winnerId]
      );
      const currentRound = wp.rows[0]?.round_number ?? 1;
      winnerNextRound = currentRound + 1;

      await client.query(
        `UPDATE tournament_participants
         SET wins = wins + 1, round_number = $1, status = 'active',
             solo_target = NULL, solo_played_at = NULL, updated_at = NOW()
         WHERE tournament_id = $2 AND user_id = $3`,
        [winnerNextRound, match.tournament_id, winnerId]
      );
      await client.query(
        `UPDATE tournament_participants
         SET losses = losses + 1, status = 'eliminated',
             solo_target = NULL, solo_played_at = NULL, updated_at = NOW()
         WHERE tournament_id = $1 AND user_id = $2`,
        [match.tournament_id, loserId]
      );

      const reg = await client.query(
        `SELECT booking_id FROM tournament_registrations WHERE tournament_id = $1 AND user_id = $2`,
        [match.tournament_id, winnerId]
      );
      const bookingId = reg.rows[0]?.booking_id ?? null;
      if (bookingId) {
        const v = await client.query(
          `SELECT ts.venue_id FROM bookings b JOIN time_slots ts ON ts.id = b.time_slot_id WHERE b.id = $1`,
          [bookingId]
        );
        requeueMeta = { preferredVenueId: v.rows[0]?.venue_id ?? null, bookingId };
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  if (match.tournament_id && match.phase === 'knockout') {
    const tournamentsService = new TournamentsService(pool, redis, env);
    await tournamentsService.advanceKnockoutWinner(matchId, winnerId);
  } else if (winnerNextRound !== null && match.tournament_id) {
    await requeuePlayer(pool, redis, winnerId, {
      tournamentId: match.tournament_id,
      roundNumber: winnerNextRound,
      preferredVenueId: requeueMeta.preferredVenueId,
      bookingId: requeueMeta.bookingId,
    }, env);
    await removeFromQueue(redis, loserId);
  }

  if (env) {
    enqueueNotification(env, {
      userId: winnerId,
      type: 'match_won',
      channels: ['in_app'],
      payload: { matchId },
      idempotencyKey: `match-won:${matchId}:${winnerId}`,
    }).catch(console.error);
    enqueueNotification(env, {
      userId: loserId,
      type: 'match_lost',
      channels: ['in_app'],
      payload: { matchId, tournamentId: match.tournament_id },
      idempotencyKey: `match-lost:${matchId}:${loserId}`,
    }).catch(console.error);
  }

  emitMatchUpdated([match.player1_id, match.player2_id], {
    matchId,
    status: 'completed',
  });

  return { status: 'completed', result: finalResult };
}

export async function assertMatchSlotPlayable(
  pool: Pool,
  timeSlotId: string | null
): Promise<void> {
  if (!timeSlotId) return;
  const slot = await pool.query(`SELECT end_time FROM time_slots WHERE id = $1`, [timeSlotId]);
  const endTime = slot.rows[0]?.end_time;
  if (endTime && new Date(endTime).getTime() <= Date.now()) {
    throw new AppError('CONFLICT', 'Match slot has ended — scores cannot be submitted', 409);
  }
}
