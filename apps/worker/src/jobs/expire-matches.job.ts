import type { Job } from 'bullmq';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { matchConfirmKey } from '../lib/queue-keys.js';
import { releaseSlotLock } from '../lib/slot-lock.js';
import { emitToUser, emitBroadcast } from '../lib/socket-bridge.js';
import { matchNotificationDetails } from '@vr-tournament/shared';

export async function processExpireMatchesJob(
  _job: Job,
  pool: Pool,
  redis: Redis,
  notificationQueue: { add: (name: string, data: unknown, opts?: { jobId?: string }) => Promise<unknown> }
) {
  const client = await pool.connect();
  try {
    // Knockout is excluded on purpose. A bracket slot is created the moment the
    // *first* feeder match resolves, with the other side still undecided, and it
    // waits at `pending_confirmation` — the only state
    // `matches_players_present` allows a half-empty match to sit in — until the
    // sibling finishes, which is always far longer than five minutes. Sweeping
    // it on age expired the match the instant it became complete, so no bracket
    // could advance and the tournament stalled in a knockout phase nothing else
    // sweeps. Bracket matches now open as `confirmed`; the only ones left here
    // are the half-filled slots, which are waiting by design.
    const expired = await client.query(
      `SELECT m.*
       FROM matches m
       WHERE m.status = 'pending_confirmation'
         AND m.phase IS DISTINCT FROM 'knockout'
         AND m.created_at < NOW() - INTERVAL '5 minutes'`
    );

    for (const match of expired.rows) {
      await client.query('BEGIN');
      try {
        // Re-checked at write time: the match may have been confirmed since the scan.
        const updated = await client.query(
          `UPDATE matches SET status = 'expired', updated_at = NOW()
           WHERE id = $1 AND status = 'pending_confirmation' RETURNING id`,
          [match.id]
        );
        if (!updated.rowCount) {
          await client.query('ROLLBACK');
          continue;
        }
        await releaseSlotLock(client, redis, match.time_slot_id);
        await redis.del(matchConfirmKey(match.id));
        await client.query('COMMIT');

        for (const userId of [match.player1_id, match.player2_id]) {
          const payload = { matchId: match.id, ...(await matchNotificationDetails(pool, 'match_expired', match.id, userId)) };
          await emitToUser(redis, userId, 'match:updated', {
            matchId: match.id,
            status: 'expired',
          });
          await emitToUser(redis, userId, 'notification:new', {
            notification: {
              type: 'match_expired',
              payload,
            },
          });
          await notificationQueue.add(
            'dispatch',
            {
              userId,
              type: 'match_expired',
              channels: ['in_app', 'email'],
              payload,
              idempotencyKey: `match-expired:${match.id}:${userId}`,
            },
            { jobId: `match-expired~${match.id}~${userId}` }
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
      } catch (err) {
        // Silence here is what hid the bracket problem: every sweep tried to
        // expire a half-filled knockout slot, the CHECK constraint refused it,
        // and the rollback said nothing — for as long as the slot existed.
        await client.query('ROLLBACK');
        console.error(`Expiring match ${match.id} failed:`, err);
      }
    }
  } finally {
    client.release();
  }
}
