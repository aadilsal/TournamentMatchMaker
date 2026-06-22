import type { Job } from 'bullmq';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { queuePlayerKey, QUEUE_MEMBER, queueTournamentKey } from '@vr-tournament/shared';
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
    const expiredMatches = await client.query(
      `SELECT m.*
       FROM matches m
       JOIN time_slots ts ON ts.id = m.time_slot_id
       WHERE m.status IN ('confirmed', 'in_progress')
         AND ts.end_time < NOW()
         AND (m.result IS NULL OR m.result->>'player1Score' IS NULL OR m.result->>'player2Score' IS NULL)`
    );

    for (const match of expiredMatches.rows) {
      await client.query('BEGIN');
      try {
        await client.query(
          `UPDATE matches SET status = 'expired', updated_at = NOW() WHERE id = $1`,
          [match.id]
        );
        await releaseSlotLock(client, redis, match.time_slot_id);
        await client.query('COMMIT');

        for (const userId of [match.player1_id, match.player2_id]) {
          await emitToUser(redis, userId, 'match:updated', {
            matchId: match.id,
            status: 'expired',
          });
        }
      } catch (err) {
        await client.query('ROLLBACK');
        console.error('Expire unplayed match error:', err);
      }
    }

    const queuedWithExpiredSlots = await client.query(
      `SELECT DISTINCT tr.user_id, tr.tournament_id, b.id AS booking_id
       FROM tournament_registrations tr
       JOIN bookings b ON b.id = tr.booking_id AND b.status = 'confirmed'
       JOIN time_slots ts ON ts.id = b.time_slot_id
       WHERE ts.end_time < NOW()`
    );

    for (const row of queuedWithExpiredSlots.rows) {
      const inQueue = await redis.sismember(QUEUE_MEMBER, row.user_id);
      if (!inQueue) continue;

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
