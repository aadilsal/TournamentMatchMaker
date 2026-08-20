import type { Pool } from 'pg';
import type { RedisClient } from './redis.js';
import type { Env } from '../config/env.js';
import type { MatchResultExtended } from '@vr-tournament/shared';
import {
  resolveAbandonedMatch,
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

  // A tie is replayed as a brand new match, never as a second innings in this
  // one. Both players have batted here and neither may bat again — the innings
  // record is per match, so re-queueing them gives each a clean innings in the
  // match they are paired into next.
  //
  // Reaching this at all means the scoreline was complete: `submitScore` only
  // resolves once both players have an innings on record, so a tie can never be
  // declared while one of them is still batting.
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

      // A bot is not re-queued. It has no play window, no booking and no
      // headset to poll, and putting one in the queue would let ordinary
      // pairing hand it to a *different* player as though it were waiting to
      // play. The human goes back in on their own; if they end up alone again,
      // the last-resort fallback gives them a bot opponent the normal way.
      const bots = await pool.query(`SELECT id FROM users WHERE id = ANY($1) AND is_bot = TRUE`, [
        [match.player1_id, match.player2_id],
      ]);
      const botIds = new Set<string>(bots.rows.map((r) => r.id as string));

      for (const userId of [match.player1_id, match.player2_id]) {
        if (botIds.has(userId)) continue;
        // requeuePlayer recovers the player's chosen play window for this round,
        // so a rematch keeps a playable slot for VR and venue players alike.
        await requeuePlayer(pool, redis, userId, {
          tournamentId: match.tournament_id,
          roundNumber,
        }, env);
      }
    }

    emitMatchUpdated([match.player1_id, match.player2_id], {
      matchId,
      status: 'cancelled',
      tournamentId: match.tournament_id,
    });

    return {
      status: 'cancelled',
      result: { ...result, player1Score, player2Score, outcome: 'rematch' },
    };
  }

  const winnerId = winnerIdFromOutcome(outcome, match.player1_id, match.player2_id)!;
  return applyMatchWinner(pool, redis, env, matchId, match, {
    ...result,
    player1Score,
    player2Score,
  }, winnerId);
}

/**
 * Everything a decided match sets in motion: ratings, standings, the winner's
 * place in the next round, the loser's exit, and the notifications for both.
 *
 * Split out from `applyMatchOutcome` because a winner is not always read off a
 * scoreline. An admin settling a disputed match names the winner directly, and
 * that path used to write `status = 'completed'` and stop — no rating, no
 * advancement, no elimination, no requeue — so the tournament never moved and
 * both players were quietly re-enrolled into the round they had just finished.
 */
export async function applyMatchWinner(
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
  winnerId: string
): Promise<{ status: string; result: MatchResultExtended }> {
  const loserId = winnerId === match.player1_id ? match.player2_id : match.player1_id;
  const finalResult: MatchResultExtended = {
    ...result,
    winnerId,
    outcome: 'win',
    source: result.source ?? 'meta',
  };

  const client = await pool.connect();
  let winnerNextRound: number | null = null;

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

      // The winner carries their previously chosen play window into the next
      // round by default; requeuePlayer resolves it from tournament_round_slots.
      await client.query(
        `INSERT INTO tournament_round_slots
           (tournament_id, user_id, round_number, time_slot_id, venue_id, booking_id)
         SELECT rs.tournament_id, rs.user_id, $1, rs.time_slot_id, rs.venue_id, rs.booking_id
         FROM tournament_round_slots rs
         JOIN time_slots ts ON ts.id = rs.time_slot_id
         WHERE rs.tournament_id = $2 AND rs.user_id = $3 AND ts.end_time > NOW()
         ORDER BY rs.round_number DESC
         LIMIT 1
         ON CONFLICT (tournament_id, user_id, round_number) DO NOTHING`,
        [winnerNextRound, match.tournament_id, winnerId]
      );
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
    tournamentId: match.tournament_id,
  });

  return { status: 'completed', result: finalResult };
}

/**
 * Settle every match still open in a round that is being closed.
 *
 * The worker's `close-round` job keeps its own copy of this — the two apps do
 * not share a database layer — but both decide the outcome with the same
 * `resolveAbandonedMatch`, so the rule itself lives in one place.
 *
 * Must run before the standings are read, so a walkover counts toward the cut.
 * Ratings are left alone deliberately: a no-show says nothing about skill.
 */
export async function settleOpenMatches(
  client: Queryable,
  tournamentId: string,
  roundNumber: number
): Promise<void> {
  const open = await client.query(
    `SELECT id, player1_id, player2_id, result
     FROM matches
     WHERE tournament_id = $1 AND round_number = $2
       AND status IN ('pending_confirmation', 'confirmed', 'in_progress')
     FOR UPDATE`,
    [tournamentId, roundNumber]
  );

  for (const match of open.rows) {
    const result = (match.result ?? {}) as MatchResultExtended;

    // A complete scoreline is already on its way to being resolved: the score
    // that filled it commits before `applyMatchOutcome` runs, so there is a
    // moment where the match is finished but not yet marked. Expiring it in
    // that window would overwrite a real result with an abandonment.
    if (result.player1Score != null && result.player2Score != null) continue;

    const outcome = resolveAbandonedMatch(result.player1Score, result.player2Score);

    if (outcome === 'abandoned') {
      await client.query(`UPDATE matches SET status = 'expired', updated_at = NOW() WHERE id = $1`, [
        match.id,
      ]);
      continue;
    }

    const winnerId = outcome === 'player1_walkover' ? match.player1_id : match.player2_id;
    const loserId = winnerId === match.player1_id ? match.player2_id : match.player1_id;

    await client.query(
      `UPDATE matches SET status = 'completed', result = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify({ ...result, winnerId, outcome: 'win', walkover: true }), match.id]
    );
    await client.query(
      `UPDATE tournament_participants SET wins = wins + 1, updated_at = NOW()
       WHERE tournament_id = $1 AND user_id = $2`,
      [tournamentId, winnerId]
    );
    await client.query(
      `UPDATE tournament_participants SET losses = losses + 1, updated_at = NOW()
       WHERE tournament_id = $1 AND user_id = $2`,
      [tournamentId, loserId]
    );
  }
}

/** Accepts a pool or a checked-out client so callers can run it inside a transaction. */
type Queryable = Pick<Pool, 'query'>;

/**
 * Whether a score may still be submitted for this match.
 *
 * A match carries a single `time_slot_id` — the window it was scheduled into —
 * but the two players may hold different windows, because pairing no longer
 * requires them to overlap. Keying purely off that one slot locked the player
 * whose window came later out of ever submitting, leaving an unplayable match.
 *
 * For a tournament match the deadline that actually matters is the **round**:
 * the round is what advances players, and a score arriving after it closes
 * cannot be counted anyway. Outside a tournament there is no round, so the
 * slot remains the only deadline available.
 */
export async function assertMatchSlotPlayable(
  pool: Queryable,
  timeSlotId: string | null,
  match?: { tournament_id: string | null; round_number: number | null }
): Promise<void> {
  // The round and the slot are two separate deadlines and a match has to be
  // inside both. Returning as soon as the round looked open treated the round as
  // a replacement for the slot, so a tournament match whose booked window had
  // already passed stayed scoreable for the rest of the round — hours, at the
  // default duration. That also raced `expire-unplayed-slots`, which expires
  // exactly those matches: whether a late score counted came down to which of
  // the two got there first. `match.endTime` is documented as the deadline for
  // submitting a score, so the slot check applies whatever the round says.
  if (match?.tournament_id) {
    const round = await pool.query(
      `SELECT ends_at, status FROM tournament_rounds
       WHERE tournament_id = $1 AND round_number = $2`,
      [match.tournament_id, match.round_number ?? 1]
    );
    const row = round.rows[0];
    if (row) {
      const ended = row.status !== 'active' || new Date(row.ends_at).getTime() <= Date.now();
      if (ended) {
        throw new AppError('CONFLICT', 'This round has closed — scores can no longer be submitted', 409);
      }
    }
  }

  if (!timeSlotId) return;
  const slot = await pool.query(`SELECT end_time FROM time_slots WHERE id = $1`, [timeSlotId]);
  const endTime = slot.rows[0]?.end_time;
  if (endTime && new Date(endTime).getTime() <= Date.now()) {
    throw new AppError('CONFLICT', 'Match slot has ended — scores cannot be submitted', 409);
  }
}
