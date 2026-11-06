import { Redis } from 'ioredis';

export type RedisClient = Redis;

let redis: RedisClient | null = null;

export function getRedis(url: string): RedisClient {
  if (!redis) {
    redis = new Redis(url, { maxRetriesPerRequest: 3 });
    logRedisErrors(redis, 'main');
  }
  return redis;
}

/** Without an 'error' listener a Redis blip crashes the process; ioredis reconnects by itself. */
export function logRedisErrors(
  client: { on(event: 'error', listener: (err: Error) => void): unknown },
  name: string
): void {
  client.on('error', (err) => console.error(`Redis error (${name}):`, err.message));
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
