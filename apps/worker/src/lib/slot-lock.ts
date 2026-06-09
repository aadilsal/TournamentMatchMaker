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
