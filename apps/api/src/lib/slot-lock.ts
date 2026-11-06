import type { Pool, PoolClient } from 'pg';
import type { RedisClient } from './redis.js';
import { slotLockKey } from './queue-keys.js';
import { AppError } from './response.js';

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

export async function finalizeMatchSlotBookings(
  client: PoolClient,
  redis: RedisClient,
  slotId: string,
  playerIds: string[],
  matchId: string
): Promise<void> {
  const uniquePlayers = [...new Set(playerIds.filter(Boolean))];

  const slotResult = await client.query(
    `SELECT * FROM time_slots WHERE id = $1 FOR UPDATE`,
    [slotId]
  );
  if (!slotResult.rows[0]) throw new Error('Slot not found');

  for (const userId of uniquePlayers) {
    await client.query(
      `INSERT INTO bookings (user_id, time_slot_id, status, match_id)
       VALUES ($1, $2, 'confirmed', $3)
       ON CONFLICT (user_id, time_slot_id) WHERE status <> 'cancelled'
       DO UPDATE SET status = 'confirmed'`,
      [userId, slotId, matchId]
    );
  }

  // The match lock ends here; the count decides between full and available.
  await client.query(`UPDATE time_slots SET status = 'available' WHERE id = $1 AND status = 'locked'`, [
    slotId,
  ]);
  await recountSlotSeats(client, slotId);
  await redis.del(slotLockKey(slotId));
}

/**
 * Re-derive a slot's seat count from its confirmed bookings, keeping a match lock in place.
 * Call with the slot row locked; refuses to overbook.
 */
export async function recountSlotSeats(
  client: Pick<PoolClient, 'query'>,
  slotId: string
): Promise<{ status: string; bookedCount: number }> {
  const counted = await client.query(
    `SELECT ts.max_capacity,
            (SELECT COUNT(*)::int FROM bookings b
             WHERE b.time_slot_id = ts.id AND b.status = 'confirmed') AS n
     FROM time_slots ts WHERE ts.id = $1`,
    [slotId]
  );
  const row = counted.rows[0];
  if (!row) throw new AppError('NOT_FOUND', 'Time slot not found', 404);
  if (row.n > row.max_capacity) throw new AppError('CONFLICT', 'Time slot is full', 409);

  const updated = await client.query(
    `UPDATE time_slots
     SET booked_count = $2,
         status = CASE WHEN status = 'locked' THEN 'locked'::slot_status
                       WHEN $2 >= max_capacity THEN 'full'::slot_status
                       ELSE 'available'::slot_status END
     WHERE id = $1
     RETURNING status, booked_count`,
    [slotId, row.n]
  );
  return { status: updated.rows[0].status, bookedCount: updated.rows[0].booked_count };
}
