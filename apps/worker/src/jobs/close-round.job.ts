import type { Job } from 'bullmq';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { emitBroadcast } from '../lib/socket-bridge.js';
import { removeFromQueue } from '../lib/queue-cleanup.js';
import {
  KNOCKOUT_ROUNDS,
  firstKnockoutMatchCount,
  playersToAdvance,
  queuePlayerKey,
  resolveFieldSize,
  shouldStartKnockout,
} from '@vr-tournament/shared';

/**
 * What a round close has to do to the queue, once the database side has
 * committed.
 *
 * A queued player is described twice — by `tournament_participants` and by
 * their `queue:player:*` hash — and closing a round used to move only the
 * first. Both matchmaking and the solo-innings check read the stale half, so a
 * player who rolled into a new round was left unable to do anything at all:
 * pairing resolves the round window from the hash's `roundNumber`, which still
 * pointed at the round that had just closed, and every attempt was discarded as
 * "no open round"; the solo flag reads the hash's `soloTarget`, which still
 * held last round's innings, so `canSubmitSoloTarget` stayed false and
 * `POST /solo-target` answered "already submitted for this round" for a round
 * they had never played.
 */
interface QueueSync {
  /** Still playing — carry them into the new round with a clean innings. */
  advanced: string[];
  /** Out of the tournament, or moved onto the bracket: nothing left to pair. */
  dequeued: string[];
  nextRoundNumber: number;
}

async function syncQueueAfterClose(redis: Redis, sync: QueueSync) {
  for (const userId of sync.dequeued) {
    await removeFromQueue(redis, userId);
  }

  for (const userId of sync.advanced) {
    const key = queuePlayerKey(userId);
    // Only touch a live entry. hset would otherwise resurrect a hash for a
    // player who has already left the queue, and a partial one at that.
    if (!(await redis.exists(key))) continue;
    await redis.hset(key, {
      roundNumber: String(sync.nextRoundNumber),
      hasPlayedSolo: '0',
      soloTarget: '',
      soloPlayedAt: '',
    });
  }
}

export async function processCloseRoundJob(_job: Job, pool: Pool, redis: Redis) {
  const expired = await pool.query(
    `SELECT tr.tournament_id, tr.round_number
     FROM tournament_rounds tr
     JOIN tournaments t ON t.id = tr.tournament_id
     WHERE tr.status = 'active'
       AND tr.ends_at < NOW()
       AND t.phase = 'normal'
       AND t.status = 'in_progress'`
  );

  for (const round of expired.rows) {
    const sync = await closeRound(pool, round.tournament_id, round.round_number);
    // Redis is brought in line only once the close has committed, so a rolled
    // back round can never leave the queue describing a round that never began.
    if (sync) await syncQueueAfterClose(redis, sync);
    // Closing a round advances or eliminates every player in it, and rebuilds
    // the bracket — none of which reached the browser until the next poll.
    await emitBroadcast(redis, 'tournament:updated', {
      tournamentId: round.tournament_id,
      reason: 'round_closed',
    });
  }
}

async function closeRound(
  pool: Pool,
  tournamentId: string,
  roundNumber: number
): Promise<QueueSync | null> {
  const client = await pool.connect();
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
      return null;
    }

    await client.query(
      `UPDATE tournament_rounds SET status = 'closed' WHERE tournament_id = $1 AND round_number = $2`,
      [tournamentId, roundNumber]
    );

    // A solo innings belongs to the round it was played in. Carrying it across
    // the boundary is what made the next round unplayable: the target is what
    // both `canSubmitSoloTarget` and `POST /solo-target` test to decide whether
    // this player has already had their innings *this* round.
    await client.query(
      `UPDATE tournament_participants
       SET solo_target = NULL, solo_played_at = NULL, updated_at = NOW()
       WHERE tournament_id = $1 AND solo_target IS NOT NULL`,
      [tournamentId]
    );

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

    // Everyone who was in the closing round and is not carried into a new one
    // has nothing left to be paired for, so they are cleared out of the queue.
    const sync: QueueSync = { advanced: [], dequeued: [], nextRoundNumber: roundNumber + 1 };

    // One player cannot be given an opponent, so there is no round and no
    // bracket left to run — they have won it. This used to fall into the
    // knockout branch, where `firstKnockoutMatchCount(1)` is zero: the
    // tournament flipped to a knockout phase holding no matches, which
    // `close-round` then skips because it only sweeps `normal` ones. Nothing
    // could move it again, so the last player standing was never declared and
    // the tournament sat idle until its end date passed.
    if (activeCount < 2) {
      await client.query(
        `UPDATE tournaments SET status = 'completed', phase = 'completed', updated_at = NOW()
         WHERE id = $1`,
        [tournamentId]
      );
      await client.query(
        `UPDATE tournament_rounds SET status = 'closed'
         WHERE tournament_id = $1 AND status = 'active'`,
        [tournamentId]
      );
      // Nobody keeps a place in a finished tournament — holding one would lock
      // the winner out of entering the next.
      await client.query(
        `UPDATE tournament_participants SET status = 'out', updated_at = NOW()
         WHERE tournament_id = $1 AND status <> 'out'`,
        [tournamentId]
      );
      sync.dequeued.push(...active.map((p) => p.user_id));

      await client.query('COMMIT');
      console.log(
        `Closed round ${roundNumber} for tournament ${tournamentId} — ${activeCount === 1 ? `${active[0].user_id} is the last player standing` : 'no players left'}, tournament completed`
      );
      return sync;
    }

    if (shouldStartKnockout(activeCount, fieldSize)) {
      for (const p of active) {
        await client.query(
          `UPDATE tournament_participants SET status = 'knockout', updated_at = NOW()
           WHERE tournament_id = $1 AND user_id = $2`,
          [tournamentId, p.user_id]
        );
      }
      // The bracket pairs knockout players directly; leaving them in the
      // matchmaking queue would let it build a second, normal-phase match
      // against the same player.
      sync.dequeued.push(...active.map((p) => p.user_id));

      const matchCount = firstKnockoutMatchCount(active.length);
      for (let slot = 0; slot < matchCount; slot++) {
        const p1 = active[slot * 2]?.user_id;
        const p2 = active[slot * 2 + 1]?.user_id;
        if (!p1 || !p2) continue;
        await client.query(
          `INSERT INTO matches (tournament_id, player1_id, player2_id, status, round_number, phase, bracket_slot)
           VALUES ($1, $2, $3, 'pending_confirmation', $4, 'knockout', $5)`,
          [tournamentId, p1, p2, KNOCKOUT_ROUNDS.ro16, slot]
        );
      }

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
          `UPDATE tournament_participants SET status = 'active', round_number = $1, updated_at = NOW()
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
      sync.advanced.push(...advancing.map((p) => p.user_id));
      sync.dequeued.push(...eliminated.map((p) => p.user_id));

      // Rounds run back to back, so the next one starts where this one ended
      // rather than whenever the sweep happened to notice. Starting at "now"
      // pushed every round later by the detection lag, and the schedule players
      // were shown drifted further out with each round.
      //
      // Unless that would land the whole round in the past: after an outage long
      // enough to swallow a full round, a contiguous window would already be
      // expired, the next sweep would close it too, and the tournament would
      // march through rounds one sweep at a time — eliminating half the field on
      // each pass. Catching up is worth a one-off gap in the schedule.
      const durationMs = roundDurationMinutes * 60_000;
      const previousEndsAt = new Date(roundResult.rows[0].ends_at);
      const contiguousEnd = previousEndsAt.getTime() + durationMs;
      const nextStarts = contiguousEnd > Date.now() ? previousEndsAt : new Date();
      const nextEnds = new Date(nextStarts.getTime() + durationMs);

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
    console.log(`Closed round ${roundNumber} for tournament ${tournamentId}`);
    return sync;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
