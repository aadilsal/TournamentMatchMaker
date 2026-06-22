import type { PoolClient } from 'pg';
import type { Redis } from 'ioredis';
import { slotLockKey } from './queue-keys.js';

export const SLOT_LOCK_TTL_SEC = 300;

export async function lockSlot(
  client: PoolClient,
  redis: Redis,
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
  client: PoolClient,
  redis: Redis,
  slotId: string | null
): Promise<void> {
  if (!slotId) return;
  await redis.del(slotLockKey(slotId));
  await client.query(
    `UPDATE time_slots SET status = 'available' WHERE id = $1 AND status = 'locked'`,
    [slotId]
  );
}

export async function finalizeMatchSlotBookings(
  client: PoolClient,
  redis: Redis,
  slotId: string,
  playerIds: string[]
): Promise<void> {
  const uniquePlayers = [...new Set(playerIds.filter(Boolean))];

  const slotResult = await client.query(
    `SELECT * FROM time_slots WHERE id = $1 FOR UPDATE`,
    [slotId]
  );
  const slot = slotResult.rows[0];
  if (!slot) throw new Error('Slot not found');

  let bookedCount = slot.booked_count;

  for (const userId of uniquePlayers) {
    const existing = await client.query(
      `SELECT id FROM bookings
       WHERE user_id = $1 AND time_slot_id = $2 AND status != 'cancelled'`,
      [userId, slotId]
    );
    if (!existing.rows[0]) {
      await client.query(
        `INSERT INTO bookings (user_id, time_slot_id, status)
         VALUES ($1, $2, 'confirmed')`,
        [userId, slotId]
      );
      bookedCount += 1;
    }
  }

  const newStatus = bookedCount >= slot.max_capacity ? 'full' : 'available';
  await client.query(
    `UPDATE time_slots SET booked_count = $1, status = $2 WHERE id = $3`,
    [bookedCount, newStatus, slotId]
  );
  await redis.del(slotLockKey(slotId));
}
