import type { Pool } from 'pg';
import type { RedisClient } from './redis.js';
import {
  buildQueuePlayerHash,
  QUEUE_GLOBAL,
  QUEUE_MEMBER,
  queuePlayerKey,
  queueTournamentKey,
} from '@vr-tournament/shared';
import { emitToUser } from '../socket/emitters.js';

export interface RequeueOptions {
  tournamentId?: string | null;
  preferredVenueId?: string | null;
  preferredCity?: string | null;
}

export async function hasActiveMatch(pool: Pool, userId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT id FROM matches
     WHERE (player1_id = $1 OR player2_id = $1)
       AND status IN ('pending_confirmation', 'confirmed', 'in_progress')
     LIMIT 1`,
    [userId]
  );
  return !!result.rows[0];
}

export async function removeFromQueue(redis: RedisClient, userId: string): Promise<void> {
  const meta = await redis.hgetall(queuePlayerKey(userId));
  const queueKey = meta.tournamentId ? queueTournamentKey(meta.tournamentId) : QUEUE_GLOBAL;
  const multi = redis.multi();
  multi.zrem(queueKey, userId);
  multi.srem(QUEUE_MEMBER, userId);
  multi.del(queuePlayerKey(userId));
  await multi.exec();
}

export async function requeuePlayer(
  pool: Pool,
  redis: RedisClient,
  userId: string,
  options: RequeueOptions = {}
): Promise<boolean> {
  const inQueue = await redis.sismember(QUEUE_MEMBER, userId);
  if (inQueue) return false;

  if (await hasActiveMatch(pool, userId)) return false;

  const userResult = await pool.query(
    `SELECT skill_tier, has_vr_headset, city, country, latitude, longitude FROM users WHERE id = $1`,
    [userId]
  );
  const user = userResult.rows[0];
  if (!user) return false;

  const joinedAt = Date.now();
  const tournamentId = options.tournamentId ?? null;
  const queueKey = tournamentId ? queueTournamentKey(tournamentId) : QUEUE_GLOBAL;

  const hash = buildQueuePlayerHash({
    userId,
    skillTier: user.skill_tier,
    hasVr: user.has_vr_headset,
    city: options.preferredCity ?? user.city,
    country: user.country,
    latitude: user.latitude,
    longitude: user.longitude,
    joinedAt,
    tournamentId,
    preferredVenueId: options.preferredVenueId ?? null,
  });

  const multi = redis.multi();
  multi.zadd(queueKey, joinedAt, userId);
  multi.sadd(QUEUE_MEMBER, userId);
  multi.hset(queuePlayerKey(userId), hash);
  await multi.exec();

  const queueSize = await redis.zcard(queueKey);
  const rank = await redis.zrank(queueKey, userId);
  emitToUser(userId, 'queue:joined', {
    position: rank !== null ? rank + 1 : 1,
    queueSize,
  });

  return true;
}
