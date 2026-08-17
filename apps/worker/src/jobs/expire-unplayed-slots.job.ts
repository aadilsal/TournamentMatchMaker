import type { Job } from 'bullmq';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import {
  outcomeForWinner,
  queuePlayerKey,
  QUEUE_MEMBER,
  queueTournamentKey,
  resolveAbandonedMatch,
} from '@vr-tournament/shared';
import { releaseSlotLock } from '../lib/slot-lock.js';
import { emitToUser } from '../lib/socket-bridge.js';
import { removeFromQueue } from '../lib/queue-cleanup.js';

export async function processExpireUnplayedSlotsJob(
  _job: Job,
  pool: Pool,
  redis: Redis
) {
  const client = await pool.connect();
  try {
    // LEFT JOIN, not JOIN: two VR players pairing outside a tournament get a
    // match with no time_slot_id, and an inner join skipped those rows entirely.
    // Nothing else expires a *confirmed* match, so they lived forever and both
    // players stayed permanently blocked from requeuing behind `hasActiveMatch`.
    // With no slot to time out against, fall back to the match's own age.
    const expiredMatches = await client.query(
      `SELECT m.*
       FROM matches m
       LEFT JOIN time_slots ts ON ts.id = m.time_slot_id
       WHERE m.status IN ('confirmed', 'in_progress')
         AND (
           (ts.id IS NOT NULL AND ts.end_time < NOW())
           OR (m.time_slot_id IS NULL AND m.created_at < NOW() - INTERVAL '2 hours')
         )
         AND (m.result IS NULL OR m.result->>'player1Score' IS NULL OR m.result->>'player2Score' IS NULL)`
    );

    for (const match of expiredMatches.rows) {
      await client.query('BEGIN');
      try {
        const result = (match.result ?? {}) as {
          player1Score?: number | null;
          player2Score?: number | null;
        };
        // One player having batted is not the same as nobody turning up. In a
        // chase the setter batted before the pair even existed, so expiring the
        // match threw away a real innings and handed the no-show the same
        // outcome as the player who played. Whoever is on the board takes it.
        const outcome = resolveAbandonedMatch(result.player1Score, result.player2Score);
        const status = outcome === 'abandoned' ? 'expired' : 'completed';

        if (outcome === 'abandoned') {
          await client.query(
            `UPDATE matches SET status = 'expired', updated_at = NOW() WHERE id = $1`,
            [match.id]
          );
        } else {
          const winnerId =
            outcome === 'player1_walkover' ? match.player1_id : match.player2_id;
          const loserId = winnerId === match.player1_id ? match.player2_id : match.player1_id;
          await client.query(
            `UPDATE matches SET status = 'completed', result = $1, updated_at = NOW() WHERE id = $2`,
            [
              JSON.stringify({
                ...result,
                winnerId,
                outcome: outcomeForWinner(winnerId, match.player1_id),
                walkover: true,
              }),
              match.id,
            ]
          );
          if (match.tournament_id) {
            await client.query(
              `UPDATE tournament_participants SET wins = wins + 1, updated_at = NOW()
               WHERE tournament_id = $1 AND user_id = $2`,
              [match.tournament_id, winnerId]
            );
            await client.query(
              `UPDATE tournament_participants SET losses = losses + 1, updated_at = NOW()
               WHERE tournament_id = $1 AND user_id = $2`,
              [match.tournament_id, loserId]
            );
          }
        }

        await releaseSlotLock(client, redis, match.time_slot_id);
        await client.query('COMMIT');

        for (const userId of [match.player1_id, match.player2_id]) {
          await emitToUser(redis, userId, 'match:updated', {
            matchId: match.id,
            status,
          });
        }
      } catch (err) {
        await client.query('ROLLBACK');
        console.error('Expire unplayed match error:', err);
      }
    }

    // Covers VR players too: they hold a play window in tournament_round_slots
    // without a venue booking, so a bookings-only query never saw them and they
    // stayed queued forever against a window that had already closed.
    const queuedWithExpiredSlots = await client.query(
      `SELECT DISTINCT user_id, tournament_id FROM (
         SELECT tr.user_id, tr.tournament_id
         FROM tournament_registrations tr
         JOIN bookings b ON b.id = tr.booking_id AND b.status = 'confirmed'
         JOIN time_slots ts ON ts.id = b.time_slot_id
         WHERE ts.end_time < NOW()
         UNION
         SELECT rs.user_id, rs.tournament_id
         FROM tournament_round_slots rs
         JOIN time_slots ts ON ts.id = rs.time_slot_id
         WHERE ts.end_time < NOW()
       ) expired
       WHERE NOT EXISTS (
         SELECT 1 FROM tournament_round_slots live
         JOIN time_slots lts ON lts.id = live.time_slot_id
         WHERE live.user_id = expired.user_id
           AND live.tournament_id = expired.tournament_id
           AND lts.end_time > NOW()
       )`
    );

    for (const row of queuedWithExpiredSlots.rows) {
      const inQueue = await redis.sismember(QUEUE_MEMBER, row.user_id);
      if (!inQueue) continue;

      // The query above asks the database whether this player *has ever held* a
      // window that is now over. What matters is the window their queue entry is
      // actually waiting on: a player carrying no window at all is waiting for
      // one to be found for them, not against a dead one, and dropping them here
      // put them straight back into the fight with enrolment — out every minute,
      // back in seconds later, never in the queue long enough to be paired.
      const meta = await redis.hgetall(queuePlayerKey(row.user_id));
      const queuedSlotEndsAt = meta.slotEndAt ? parseInt(meta.slotEndAt, 10) : null;
      if (!queuedSlotEndsAt || queuedSlotEndsAt > Date.now()) continue;

      const activeMatch = await client.query(
        `SELECT id FROM matches
         WHERE (player1_id = $1 OR player2_id = $1)
           AND status IN ('confirmed', 'in_progress')
         LIMIT 1`,
        [row.user_id]
      );
      if (activeMatch.rows[0]) continue;

      await removeFromQueue(redis, row.user_id);
      await emitToUser(redis, row.user_id, 'queue:pair_failed', {
        reason: 'slot_expired',
        message: 'Your booked slot has ended without a match.',
        retryable: false,
      });
    }
  } finally {
    client.release();
  }
}
