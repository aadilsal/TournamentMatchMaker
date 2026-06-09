import { Redis } from 'ioredis';

export type RedisClient = Redis;

let redis: RedisClient | null = null;

export function getRedis(url: string): RedisClient {
  if (!redis) {
    redis = new Redis(url, { maxRetriesPerRequest: 3 });
  }
  return redis;
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
