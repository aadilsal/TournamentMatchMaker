import type { Job } from 'bullmq';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { matchConfirmKey } from '../lib/queue-keys.js';
import { releaseSlotLock } from '../lib/slot-lock.js';
import { emitToUser, emitBroadcast } from '../lib/socket-bridge.js';

export async function processExpireMatchesJob(
  _job: Job,
  pool: Pool,
  redis: Redis,
  notificationQueue: { add: (name: string, data: unknown, opts?: { jobId?: string }) => Promise<unknown> }
) {
  const client = await pool.connect();
  try {
    const expired = await client.query(
      `SELECT m.*
       FROM matches m
       WHERE m.status = 'pending_confirmation'
         AND m.created_at < NOW() - INTERVAL '5 minutes'`
    );

    for (const match of expired.rows) {
      await client.query('BEGIN');
      try {
        await client.query(
          `UPDATE matches SET status = 'expired', updated_at = NOW() WHERE id = $1`,
          [match.id]
        );
        await releaseSlotLock(client, redis, match.time_slot_id);
        await redis.del(matchConfirmKey(match.id));
        await client.query('COMMIT');

        for (const userId of [match.player1_id, match.player2_id]) {
          await emitToUser(redis, userId, 'match:updated', {
            matchId: match.id,
            status: 'expired',
          });
          await emitToUser(redis, userId, 'notification:new', {
            notification: {
              type: 'match_expired',
              payload: { matchId: match.id },
            },
          });
          await notificationQueue.add(
            'dispatch',
            {
              userId,
              type: 'match_expired',
              channels: ['in_app', 'email'],
              payload: { matchId: match.id },
              idempotencyKey: `match-expired:${match.id}:${userId}`,
            },
            { jobId: `match-expired:${match.id}:${userId}` }
          );
        }
        if (match.time_slot_id) {
          const slotRow = await client.query(
            `SELECT venue_id, start_time, status FROM time_slots WHERE id = $1`,
            [match.time_slot_id]
          );
          const slot = slotRow.rows[0];
          if (slot) {
            await emitBroadcast(redis, 'slot:updated', {
              venueId: slot.venue_id,
              slotId: match.time_slot_id,
              status: slot.status,
              date: new Date(slot.start_time).toISOString().slice(0, 10),
            });
          }
        }
      } catch {
        await client.query('ROLLBACK');
      }
    }
  } finally {
    client.release();
  }
}
