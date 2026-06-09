import type { Redis } from 'ioredis';

const LOCK_TTL_MS = 4000;

export async function acquireLock(redis: Redis, key: string): Promise<boolean> {
  const result = await redis.set(key, process.pid.toString(), 'PX', LOCK_TTL_MS, 'NX');
  return result === 'OK';
}

export async function releaseLock(redis: Redis, key: string): Promise<void> {
  await redis.del(key);
}
