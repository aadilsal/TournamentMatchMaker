import { randomUUID } from 'crypto';
import type { Redis } from 'ioredis';
import type { PoolClient } from 'pg';

// Well past a full drain; correctness does not rest on it (pairing also takes per-player DB locks).
const LOCK_TTL_MS = 120_000;

const RELEASE_IF_OWNER = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

/** Returns the owner token, or null when someone else holds the lock. */
export async function acquireLock(redis: Redis, key: string): Promise<string | null> {
  const token = randomUUID();
  const result = await redis.set(key, token, 'PX', LOCK_TTL_MS, 'NX');
  return result === 'OK' ? token : null;
}

/**
 * Serialise match creation per player for the rest of the transaction, so a
 * "does this player already have a live match" check cannot race another pairing.
 */
export async function lockPlayersForMatch(
  client: Pick<PoolClient, 'query'>,
  userIds: string[]
): Promise<void> {
  // Sorted so two transactions locking the same pair never deadlock.
  for (const id of [...new Set(userIds)].sort()) {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('match-player:' || $1))`, [id]);
  }
}

/** Deletes the lock only if this caller still owns it. */
export async function releaseLock(redis: Redis, key: string, token: string): Promise<void> {
  await redis.eval(RELEASE_IF_OWNER, 1, key, token);
}
