import type { Pool, PoolClient } from 'pg';
import type { RedisClient } from './redis.js';
import { slotLockKey } from './queue-keys.js';

export const SLOT_LOCK_TTL_SEC = 300;

export async function lockSlot(
  client: PoolClient,
  redis: RedisClient,
  slotId: string,
  matchId: string
): Promise<boolean> {
  const lockKey = slotLockKey(slotId);
  const acquired = await redis.set(lockKey, matchId, 'EX', SLOT_LOCK_TTL_SEC, 'NX');
  if (!acquired) return false;

  const slotResult = await client.query(
    `SELECT * FROM time_slots WHERE id = $1 FOR UPDATE`,
    [slotId]
  );
  const slot = slotResult.rows[0];
  if (!slot || slot.status === 'locked' || slot.booked_count >= slot.max_capacity) {
    await redis.del(lockKey);
    return false;
  }

  await client.query(`UPDATE time_slots SET status = 'locked' WHERE id = $1`, [slotId]);
  return true;
}

export async function releaseSlotLock(
  pool: Pool,
  redis: RedisClient,
  slotId: string | null
): Promise<void> {
  if (!slotId) return;
  await redis.del(slotLockKey(slotId));
  await pool.query(
    `UPDATE time_slots SET status = 'available' WHERE id = $1 AND status = 'locked'`,
    [slotId]
  );
}

export async function convertSlotLockToBooking(
  client: PoolClient,
  redis: RedisClient,
  slotId: string,
  userId: string
): Promise<string> {
  const slotResult = await client.query(
    `SELECT * FROM time_slots WHERE id = $1 FOR UPDATE`,
    [slotId]
  );
  const slot = slotResult.rows[0];
  if (!slot) throw new Error('Slot not found');

  const bookingResult = await client.query(
    `INSERT INTO bookings (user_id, time_slot_id, status)
     VALUES ($1, $2, 'confirmed')
     ON CONFLICT (user_id, time_slot_id) DO UPDATE SET status = 'confirmed'
     RETURNING id`,
    [userId, slotId]
  );

  const newBookedCount = slot.booked_count + 1;
  const newStatus = newBookedCount >= slot.max_capacity ? 'full' : 'available';
  await client.query(
    `UPDATE time_slots SET booked_count = $1, status = $2 WHERE id = $3`,
    [newBookedCount, newStatus, slotId]
  );
  await redis.del(slotLockKey(slotId));
  return bookingResult.rows[0].id;
}
