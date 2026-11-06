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
  playerIds: string[],
  matchId: string
): Promise<void> {
  const uniquePlayers = [...new Set(playerIds.filter(Boolean))];

  const slotResult = await client.query(
    `SELECT * FROM time_slots WHERE id = $1 FOR UPDATE`,
    [slotId]
  );
  const slot = slotResult.rows[0];
  if (!slot) throw new Error('Slot not found');

  for (const userId of uniquePlayers) {
    await client.query(
      `INSERT INTO bookings (user_id, time_slot_id, status, match_id)
       VALUES ($1, $2, 'confirmed', $3)
       ON CONFLICT (user_id, time_slot_id) WHERE status <> 'cancelled'
       DO UPDATE SET status = 'confirmed'`,
      [userId, slotId, matchId]
    );
  }

  // Derived from the bookings, never incremented, so the seat count cannot drift or overbook.
  const counted = await client.query(
    `SELECT COUNT(*)::int AS n FROM bookings WHERE time_slot_id = $1 AND status = 'confirmed'`,
    [slotId]
  );
  const bookedCount: number = counted.rows[0].n;
  if (bookedCount > slot.max_capacity) throw new Error(`Slot ${slotId} has no room for this match`);

  const newStatus = bookedCount >= slot.max_capacity ? 'full' : 'available';
  await client.query(
    `UPDATE time_slots SET booked_count = $1, status = $2 WHERE id = $3`,
    [bookedCount, newStatus, slotId]
  );
  await redis.del(slotLockKey(slotId));
}
