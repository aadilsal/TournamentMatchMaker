import type { Job } from 'bullmq';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { QUEUE_MEMBER, parseQueuePlayerMeta, queuePlayerKey } from '@vr-tournament/shared';
import { removeFromQueue } from '../lib/queue-cleanup.js';

/**
 * Clears out queue entries that can never produce a match.
 *
 * The queue lives in Redis and the truth about who may play lives in Postgres,
 * so the two drift: a database restored or reset from a dump leaves entries
 * pointing at tournaments that no longer exist, and a player retired by hand
 * keeps their slot in the queue. Neither is harmless. `pair-players` walks
 * every member of a queue on every pass and gives up on the whole queue when it
 * cannot resolve a round, so dead entries slow real pairing down and make the
 * queue-size numbers on the admin dashboard meaningless.
 *
 * Only provably dead entries are removed — an entry is left alone unless the
 * database says this player has nothing to play for:
 *
 *   - the tournament is gone, or has finished
 *   - they are not a participant of it
 *   - their participant record is not one that may be paired
 *
 * A player queued outside any tournament has no such record to check against
 * and is never touched.
 */
export async function processReconcileQueueJob(_job: Job, pool: Pool, redis: Redis) {
  const members = await redis.smembers(QUEUE_MEMBER);
  if (members.length === 0) return;

  const stale: Array<{ userId: string; reason: string }> = [];

  for (const userId of members) {
    const meta = parseQueuePlayerMeta(await redis.hgetall(queuePlayerKey(userId)));

    // No hash behind the membership at all: nothing can be resolved from it, so
    // pairing skips it forever.
    if (!meta) {
      stale.push({ userId, reason: 'no queue metadata' });
      continue;
    }
    if (!meta.tournamentId) continue;

    // Registration is what `POST /matchmaking/queue` gates on, and it treats a
    // missing participant row as acceptable — so this does too. Anything
    // stricter would evict players the API would happily let back in.
    const result = await pool.query(
      `SELECT t.status AS tournament_status, t.phase,
              reg.id AS registration_id, tp.status AS participant_status
         FROM tournaments t
         LEFT JOIN tournament_registrations reg
           ON reg.tournament_id = t.id AND reg.user_id = $2
         LEFT JOIN tournament_participants tp
           ON tp.tournament_id = t.id AND tp.user_id = $2
        WHERE t.id = $1`,
      [meta.tournamentId, userId]
    );
    const row = result.rows[0];

    if (!row) {
      stale.push({ userId, reason: `tournament ${meta.tournamentId} no longer exists` });
    } else if (row.tournament_status === 'completed' || row.phase === 'completed') {
      stale.push({ userId, reason: 'tournament has finished' });
    } else if (!row.registration_id) {
      stale.push({ userId, reason: 'not registered for that tournament' });
    } else if (row.participant_status && !['active', 'advanced'].includes(row.participant_status)) {
      stale.push({ userId, reason: `participant is ${row.participant_status}` });
    }
  }

  for (const { userId, reason } of stale) {
    await removeFromQueue(redis, userId);
    console.log(`Dropped stale queue entry for ${userId}: ${reason}`);
  }

  if (stale.length > 0) {
    console.log(`Queue reconciliation removed ${stale.length} of ${members.length} entries`);
  }
}
