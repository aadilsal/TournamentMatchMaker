import type { Job } from 'bullmq';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { emitBroadcast, emitToUser } from '../lib/socket-bridge.js';
import { removeFromQueue } from '../lib/queue-cleanup.js';
import {
  knockoutDraw,
  playersToAdvance,
  queuePlayerKey,
  resolveAbandonedMatch,
  resolveMatchOutcome,
  winnerIdFromOutcome,
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
  /** Bracket matches opened by this close, to announce once it has committed. */
  bracketMatches: BracketMatch[];
}

interface BracketMatch {
  matchId: string;
  player1Id: string;
  player2Id: string;
}

type NotificationQueue = {
  add: (name: string, data: unknown, opts?: { jobId?: string }) => Promise<unknown>;
};

/**
 * Tell both players a bracket match is waiting.
 *
 * Nothing announced these at all: the close emitted a bare `tournament:updated`
 * and left the match to be discovered. A player who never went looking simply
 * never played it.
 */
async function announceBracketMatches(
  pool: Pool,
  redis: Redis,
  notificationQueue: NotificationQueue,
  matches: BracketMatch[]
): Promise<void> {
  if (matches.length === 0) return;

  const ids = [...new Set(matches.flatMap((m) => [m.player1Id, m.player2Id]))];
  const users = await pool.query(
    `SELECT id, username, skill_tier FROM users WHERE id = ANY($1)`,
    [ids]
  );
  const byId = new Map(users.rows.map((u) => [u.id, u]));

  for (const match of matches) {
    for (const [playerId, opponentId] of [
      [match.player1Id, match.player2Id],
      [match.player2Id, match.player1Id],
    ] as const) {
      const opponent = byId.get(opponentId);
      const payload = {
        matchId: match.matchId,
        opponent: {
          id: opponentId,
          username: opponent?.username ?? 'Unknown',
          skillTier: opponent?.skill_tier ?? 3,
        },
        venue: undefined,
        slot: undefined,
        chaseTarget: null,
        amChasing: false,
        autoConfirmed: true,
        confirmDeadline: null,
      };

      await emitToUser(redis, playerId, 'match:found', payload);
      await notificationQueue.add(
        'dispatch',
        {
          userId: playerId,
          type: 'match_found',
          channels: ['in_app', 'email'],
          payload,
          idempotencyKey: `match-found:${match.matchId}:${playerId}`,
        },
        { jobId: `match-found~${match.matchId}~${playerId}` }
      );
    }
  }
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

export async function processCloseRoundJob(
  _job: Job,
  pool: Pool,
  redis: Redis,
  notificationQueue: NotificationQueue
) {
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
    if (sync) {
      await syncQueueAfterClose(redis, sync);
      await announceBracketMatches(pool, redis, notificationQueue, sync.bracketMatches);
    }
    // Closing a round advances or eliminates every player in it, and rebuilds
    // the bracket — none of which reached the browser until the next poll.
    await emitBroadcast(redis, 'tournament:updated', {
      tournamentId: round.tournament_id,
      reason: 'round_closed',
    });
  }

  // Nothing else sweeps the knockout phase, so a bracket that stops moving
  // stops the tournament for good.
  await sweepStalledKnockouts(pool, redis, notificationQueue);
}

/**
 * Restart a knockout bracket that has stopped moving, or finish it.
 *
 * Once a tournament enters the bracket, no scheduled job touches it again:
 * `close-round` and `enrol` both filter to `phase = 'normal'`, and nothing
 * changes a knockout participant's status. So a bracket that loses its last
 * live match simply stops, with its players held at `knockout` — able to play
 * nothing, queue for nothing, and enter no other tournament — until the
 * tournament's end date passes days later.
 *
 * Two ways in, both seen in practice. A bracket match could be expired out from
 * under the players (see the note in `expire-matches`). And an odd number of
 * players leaves someone with no match at all: `firstKnockoutMatchCount(3)` is
 * 1, so the third player is dropped from the draw entirely and the slot above
 * waits forever for an opponent who was never scheduled.
 *
 * Rather than model byes and re-seeding for every field size, this asks the only
 * question that matters — who is still standing? — and gives them a round.
 * One player left is the champion; two or more get a fresh set of matches.
 */
async function sweepStalledKnockouts(
  pool: Pool,
  redis: Redis,
  notificationQueue: NotificationQueue
): Promise<void> {
  // "Live" means playable: both sides known. A slot still waiting on a feeder
  // has nobody to play it, so a bracket holding only those has stopped, not
  // progressed — which is exactly the state a lost sibling match leaves behind.
  const stalled = await pool.query(
    `SELECT t.id
     FROM tournaments t
     WHERE t.status = 'in_progress' AND t.phase = 'knockout'
       AND NOT EXISTS (
         SELECT 1 FROM matches m
         WHERE m.tournament_id = t.id AND m.phase = 'knockout'
           AND m.status IN ('pending_confirmation', 'confirmed', 'in_progress')
           AND m.player1_id IS NOT NULL AND m.player2_id IS NOT NULL
       )`
  );

  for (const row of stalled.rows) {
    try {
      const opened = await restartBracket(pool, row.id);
      if (opened) {
        await announceBracketMatches(pool, redis, notificationQueue, opened);
        await emitBroadcast(redis, 'tournament:updated', {
          tournamentId: row.id,
          reason: 'round_closed',
        });
      }
    } catch (err) {
      console.error(`Knockout sweep failed for tournament ${row.id}:`, err);
    }
  }
}

async function restartBracket(pool: Pool, tournamentId: string): Promise<BracketMatch[] | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Re-read under a lock: the bracket may have moved between the scan and now.
    const locked = await client.query(
      `SELECT phase, status FROM tournaments WHERE id = $1 FOR UPDATE`,
      [tournamentId]
    );
    if (locked.rows[0]?.phase !== 'knockout' || locked.rows[0]?.status !== 'in_progress') {
      await client.query('ROLLBACK');
      return null;
    }
    const live = await client.query(
      `SELECT 1 FROM matches WHERE tournament_id = $1 AND phase = 'knockout'
         AND status IN ('pending_confirmation', 'confirmed', 'in_progress')
         AND player1_id IS NOT NULL AND player2_id IS NOT NULL LIMIT 1`,
      [tournamentId]
    );
    if (live.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }

    // Slots left waiting on a feeder that will never finish. They hold no result
    // and no player pairing worth keeping, and they cannot be expired —
    // `matches_players_present` only tolerates a half-empty match while it is
    // pending — so the draw below replaces them outright.
    await client.query(
      `DELETE FROM matches
       WHERE tournament_id = $1 AND phase = 'knockout'
         AND status = 'pending_confirmation'
         AND (player1_id IS NULL OR player2_id IS NULL)`,
      [tournamentId]
    );

    // Still standing: in the bracket, and not the loser of a bracket match that
    // was actually played. Nothing marks a knockout loser on the participant
    // row, so the matches are the only record of who went out.
    const alive = await client.query(
      `SELECT tp.user_id
       FROM tournament_participants tp
       WHERE tp.tournament_id = $1 AND tp.status = 'knockout'
         AND NOT EXISTS (
           SELECT 1 FROM matches m
           WHERE m.tournament_id = tp.tournament_id AND m.phase = 'knockout'
             AND m.status = 'completed'
             AND m.result->>'winnerId' IS NOT NULL
             AND m.result->>'winnerId' <> tp.user_id::text
             AND (m.player1_id = tp.user_id OR m.player2_id = tp.user_id)
         )
       ORDER BY tp.wins DESC, tp.losses ASC, tp.created_at ASC`,
      [tournamentId]
    );
    const players = alive.rows.map((r) => r.user_id as string);

    if (players.length < 2) {
      await client.query(
        `UPDATE tournaments SET status = 'completed', phase = 'completed', updated_at = NOW()
         WHERE id = $1`,
        [tournamentId]
      );
      await client.query(
        `UPDATE tournament_participants SET status = 'out', updated_at = NOW()
         WHERE tournament_id = $1 AND status <> 'out'`,
        [tournamentId]
      );
      await client.query('COMMIT');
      console.log(
        `Knockout for ${tournamentId} had no live matches left — ${
          players.length === 1 ? `${players[0]} is the champion` : 'nobody left'
        }, tournament completed`
      );
      return null;
    }

    const { roundNumber, pairs, bye } = knockoutDraw(players);

    // `idx_matches_bracket_slot` covers dead rows too, so a slot number from an
    // abandoned attempt at this round would collide. The finished matches stay
    // as history; only their claim on a slot is released.
    await client.query(
      `UPDATE matches SET bracket_slot = NULL, updated_at = NOW()
       WHERE tournament_id = $1 AND phase = 'knockout' AND round_number = $2
         AND status IN ('expired', 'cancelled')`,
      [tournamentId, roundNumber]
    );

    const opened: BracketMatch[] = [];
    for (const [slot, [p1, p2]] of pairs.entries()) {
      const created = await client.query(
        `INSERT INTO matches (tournament_id, player1_id, player2_id, status, round_number, phase, bracket_slot)
         VALUES ($1, $2, $3, 'confirmed', $4, 'knockout', $5)
         RETURNING id`,
        [tournamentId, p1, p2, roundNumber, slot]
      );
      opened.push({ matchId: created.rows[0].id, player1Id: p1, player2Id: p2 });
    }

    await client.query('COMMIT');
    console.log(
      `Restarted stalled knockout for ${tournamentId}: ${opened.length} match(es) for ${players.length} player(s) at round ${roundNumber}${bye ? ` (${bye} has a bye)` : ''}`
    );
    return opened;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Settle every match still open in the round being closed.
 *
 * A match outlives its round whenever it was made near the deadline, and
 * nothing used to clear it: `assertMatchSlotPlayable` refuses a score for a
 * closed round, so neither player could finish it, and both were then held out
 * of the new round by the `hasActiveMatch` guard that `requeuePlayer` and
 * enrolment share — while `GET /matches/current` went on showing them a match
 * to play. Nothing released them until the booked slot's end time passed, which
 * can be an entire round later.
 *
 * Runs before the standings are read, so a walkover awarded here counts toward
 * the cut like any other win. Ratings are deliberately left alone: an opponent
 * not turning up says nothing about how well anyone plays.
 */
/**
 * How long a complete-but-unresolved scoreline is left alone before this sweep
 * decides it. Long enough that a resolution still in flight is never
 * overwritten, short enough that a match stranded by a failed one is cleared
 * on the next pass rather than holding its players out of matchmaking.
 */
const RESOLUTION_GRACE_MS = 2 * 60 * 1000;

async function settleOpenMatches(
  client: import('pg').PoolClient,
  tournamentId: string,
  roundNumber: number
): Promise<void> {
  const open = await client.query(
    `SELECT id, player1_id, player2_id, result, updated_at
     FROM matches
     WHERE tournament_id = $1 AND round_number = $2
       AND status IN ('pending_confirmation', 'confirmed', 'in_progress')
     FOR UPDATE`,
    [tournamentId, roundNumber]
  );

  for (const match of open.rows) {
    const result = (match.result ?? {}) as {
      player1Score?: number | null;
      player2Score?: number | null;
      winnerId?: string | null;
      outcome?: string | null;
      chaseTarget?: number | null;
      chasePlayerId?: string | null;
    };

    // A complete scoreline is usually on its way to being resolved: the score
    // that filled it commits before `applyMatchOutcome` runs, so there is a
    // moment where the match is finished but not yet marked, and expiring it in
    // that window would overwrite a real result with an abandonment.
    //
    // But `applyMatchOutcome` can fail to run at all — it is called after that
    // commit, so anything that throws in between (a round that closed while the
    // score was in flight) leaves both innings recorded and no outcome. Skipping
    // on the scoreline alone made that permanent: the match stayed open forever,
    // and its players stayed "in a match" and could never be paired again.
    //
    // So only defer to a resolution that could still be in flight. Once the row
    // has been untouched for a couple of minutes there is no race left to lose,
    // and the scoreline decides the match here.
    if (result.player1Score != null && result.player2Score != null) {
      const settled = result.winnerId != null || result.outcome != null;
      const age = Date.now() - new Date(match.updated_at as string).getTime();
      if (settled || age < RESOLUTION_GRACE_MS) continue;

      const decided = resolveMatchOutcome(
        match.player1_id,
        match.player2_id,
        result.player1Score,
        result.player2Score,
        { chaseTarget: result.chaseTarget ?? null, chasePlayerId: result.chasePlayerId ?? null }
      );
      const decidedWinner = winnerIdFromOutcome(decided, match.player1_id, match.player2_id);

      await client.query(
        `UPDATE matches SET status = 'completed', result = $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify({ ...result, winnerId: decidedWinner, outcome: decided }), match.id]
      );
      if (decidedWinner) {
        const decidedLoser =
          decidedWinner === match.player1_id ? match.player2_id : match.player1_id;
        await client.query(
          `UPDATE tournament_participants SET wins = wins + 1, updated_at = NOW()
           WHERE tournament_id = $1 AND user_id = $2`,
          [tournamentId, decidedWinner]
        );
        await client.query(
          `UPDATE tournament_participants SET losses = losses + 1, updated_at = NOW()
           WHERE tournament_id = $1 AND user_id = $2`,
          [tournamentId, decidedLoser]
        );
      }
      console.log(
        `Settled stranded match ${match.id} from its recorded innings: ${result.player1Score}-${result.player2Score} (${decided})`
      );
      continue;
    }

    const outcome = resolveAbandonedMatch(result.player1Score, result.player2Score);

    if (outcome === 'abandoned') {
      await client.query(
        `UPDATE matches SET status = 'expired', updated_at = NOW() WHERE id = $1`,
        [match.id]
      );
      continue;
    }

    const winnerId = outcome === 'player1_walkover' ? match.player1_id : match.player2_id;
    const loserId = winnerId === match.player1_id ? match.player2_id : match.player1_id;

    await client.query(
      `UPDATE matches
       SET status = 'completed',
           result = $1,
           updated_at = NOW()
       WHERE id = $2`,
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
    console.log(
      `Round ${roundNumber} of ${tournamentId} closed over match ${match.id}: ${winnerId} takes it by walkover`
    );
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

    // Before the standings are read: a match still open in this round can never
    // be finished once the round shuts, and leaving it open locks both players
    // out of the next one.
    await settleOpenMatches(client, tournamentId, roundNumber);

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
    const sync: QueueSync = {
      advanced: [],
      dequeued: [],
      nextRoundNumber: roundNumber + 1,
      bracketMatches: [],
    };

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

      // `knockoutDraw` sizes the round to the field and gives an odd player out
      // a bye. Taking `firstKnockoutMatchCount` slots instead simply left them
      // out of the draw — no match to play, and no way into the next round.
      const { roundNumber: bracketRound, pairs } = knockoutDraw(active.map((p) => p.user_id));
      for (const [slot, [p1, p2]] of pairs.entries()) {
        // Confirmed on creation, like every other tournament match (pairing
        // auto-confirms whenever there is a tournament). Left at
        // `pending_confirmation` these were swept away by `expire-matches`
        // five minutes later — unannounced, and invisible to the headset,
        // which never surfaces an unconfirmed match — so the bracket died
        // before anyone could play it.
        const created = await client.query(
          `INSERT INTO matches (tournament_id, player1_id, player2_id, status, round_number, phase, bracket_slot)
           VALUES ($1, $2, $3, 'confirmed', $4, 'knockout', $5)
           RETURNING id`,
          [tournamentId, p1, p2, bracketRound, slot]
        );
        sync.bracketMatches.push({ matchId: created.rows[0].id, player1Id: p1, player2Id: p2 });
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
