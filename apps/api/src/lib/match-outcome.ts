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
import { openRematch } from './rematch.js';
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
    const roundNumber = match.round_number ?? 1;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE matches SET status = 'cancelled', result = $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify({ ...result, player1Score, player2Score, outcome: 'rematch' }), matchId]
      );
      // The instruction to replay is committed with the cancellation, so the
      // pair can never end up with a dead match and nothing telling the queue
      // they belong to each other. Knockout is excluded: those matches are
      // drawn by the bracket rather than picked out of the queue, so a pin the
      // queue would have to consume has nothing to act on there.
      if (match.tournament_id && match.phase !== 'knockout') {
        await openRematch(client, {
          tournamentId: match.tournament_id,
          roundNumber,
          sourceMatchId: matchId,
          player1Id: match.player1_id,
          player2Id: match.player2_id,
        });
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    if (match.phase === 'knockout') {
      // A bracket slot has no window to pick and no queue pin to honour, so a
      // drawn knockout match goes back the way it always has: both players
      // returned to the queue for their bracket round, which pairs them with
      // each other because nobody else is in it.
      if (match.tournament_id) {
        for (const userId of [match.player1_id, match.player2_id]) {
          await requeuePlayer(pool, redis, userId, {
            tournamentId: match.tournament_id,
            roundNumber,
            allowWithoutSlot: true,
          }, env);
        }
      }
    } else {
      // Neither player is put back in the queue here. A draw is replayed against
      // the same opponent, at a window both of them have to choose again — an
      // automatic requeue on the window they just used would pair whoever came
      // back first with whatever stranger was waiting, which is the one thing a
      // rematch must not do. They re-enter through the slot picker, and the pin
      // written above is what brings them back to each other.
      for (const userId of [match.player1_id, match.player2_id]) {
        await removeFromQueue(redis, userId);
      }
    }

    if (env && match.tournament_id && match.phase !== 'knockout') {
      for (const [userId, opponentId] of [
        [match.player1_id, match.player2_id],
        [match.player2_id, match.player1_id],
      ]) {
        enqueueNotification(env, {
          userId,
          type: 'rematch_required',
          channels: ['in_app'],
          payload: {
            matchId,
            tournamentId: match.tournament_id,
            roundNumber,
            opponentId,
          },
          idempotencyKey: `rematch-required:${matchId}:${userId}`,
        }).catch(console.error);
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

      // No window is carried into the next round. The round the winner just
      // finished had a date attached to it, and the next one does not fall on
      // the same day — copying the slot row forward scheduled them into a
      // window that had already passed, or into one they never agreed to. They
      // pick again through the slot picker, which offers the time of day they
      // last used as the default and asks them for the date.
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
    // Both leave the queue: the loser for good, the winner until they have
    // chosen a window for the round they just reached. Leaving the winner
    // queued on the entry from the round they finished is what let them be
    // paired for a round they had not scheduled themselves into.
    await removeFromQueue(redis, winnerId);
    await removeFromQueue(redis, loserId);
  }

  if (env) {
    enqueueNotification(env, {
      userId: winnerId,
      type: 'match_won',
      channels: ['in_app'],
      payload: { matchId, tournamentId: match.tournament_id, nextRound: winnerNextRound },
      idempotencyKey: `match-won:${matchId}:${winnerId}`,
    }).catch(console.error);

    // Advancing now leaves the player with nothing scheduled, so the prompt to
    // pick a window is the only thing standing between them and a round they
    // sit out without ever being told why.
    if (winnerNextRound !== null && match.tournament_id) {
      enqueueNotification(env, {
        userId: winnerId,
        type: 'slot_selection_required',
        channels: ['in_app'],
        payload: {
          tournamentId: match.tournament_id,
          roundNumber: winnerNextRound,
        },
        idempotencyKey: `slot-required:${match.tournament_id}:${winnerId}:${winnerNextRound}`,
      }).catch(console.error);
    }
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

/**
 * Settle every draw in this round that was never replayed.
 *
 * A replay needs both players to come back and pick a window, and only one of
 * them may do so. Left alone that is indistinguishable from neither turning up,
 * and the player who did their part is cut on the same footing as the one who
 * ignored it — so the rule an abandoned match already gets applies here too:
 * the side that showed up takes the walkover. A match row is written for it so
 * the result is visible in the players' history rather than existing only as a
 * number in the standings. Ratings are left alone, as with any walkover.
 *
 * The worker keeps its own copy of this in `close-round.job.ts`, and the two
 * must agree.
 */
export async function settleUnplayedRematches(
  client: Queryable,
  tournamentId: string,
  roundNumber: number
): Promise<void> {
  const pending = await client.query(
    `SELECT id, source_match_id, player1_id, player2_id, player1_slot_id, player2_slot_id
     FROM tournament_rematches
     WHERE tournament_id = $1 AND round_number = $2 AND status = 'pending'
     FOR UPDATE`,
    [tournamentId, roundNumber]
  );

  for (const rematch of pending.rows) {
    const p1Ready = rematch.player1_slot_id !== null;
    const p2Ready = rematch.player2_slot_id !== null;

    // Both came back but were never paired, or neither did. Either way there is
    // no basis for handing one of them a win, so the draw stands.
    if (p1Ready === p2Ready) {
      await client.query(
        `UPDATE tournament_rematches SET status = 'expired', updated_at = NOW() WHERE id = $1`,
        [rematch.id]
      );
      continue;
    }

    const winnerId = p1Ready ? rematch.player1_id : rematch.player2_id;
    const loserId = p1Ready ? rematch.player2_id : rematch.player1_id;

    const walkover = await client.query(
      `INSERT INTO matches
         (tournament_id, player1_id, player2_id, status, round_number, phase, result)
       VALUES ($1, $2, $3, 'completed', $4, 'normal', $5)
       RETURNING id`,
      [
        tournamentId,
        rematch.player1_id,
        rematch.player2_id,
        roundNumber,
        JSON.stringify({
          player1Score: null,
          player2Score: null,
          winnerId,
          outcome: 'win',
          walkover: true,
          rematchOfMatchId: rematch.source_match_id,
        }),
      ]
    );

    await client.query(
      `UPDATE tournament_rematches
       SET status = 'expired', match_id = $1, updated_at = NOW()
       WHERE id = $2`,
      [walkover.rows[0].id, rematch.id]
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
