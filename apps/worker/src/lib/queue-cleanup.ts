import {
  QUEUE_GLOBAL,
  QUEUE_MEMBER,
  QUEUE_TOURNAMENT_INDEX,
  queuePlayerKey,
  queueTournamentKey,
} from '@vr-tournament/shared';
import type { Redis } from 'ioredis';

export async function removeFromQueue(redis: Redis, userId: string): Promise<void> {
  const meta = await redis.hgetall(queuePlayerKey(userId));
  const queueKey = meta.tournamentId ? queueTournamentKey(meta.tournamentId) : QUEUE_GLOBAL;
  const multi = redis.multi();
  multi.zrem(queueKey, userId);
  multi.zrem(QUEUE_GLOBAL, userId);
  if (meta.tournamentId) {
    multi.zrem(queueTournamentKey(meta.tournamentId), userId);
  }
  multi.srem(QUEUE_MEMBER, userId);
  multi.del(queuePlayerKey(userId));
  await multi.exec();

  if (meta.tournamentId) {
    const remaining = await redis.zcard(queueKey);
    if (remaining === 0) {
      await redis.srem(QUEUE_TOURNAMENT_INDEX, meta.tournamentId);
    }
  }
}
