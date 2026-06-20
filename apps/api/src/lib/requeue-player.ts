import type { Pool } from 'pg';
import type { RedisClient } from './redis.js';
import {
  buildQueuePlayerHash,
  QUEUE_GLOBAL,
  QUEUE_MEMBER,
  QUEUE_TOURNAMENT_INDEX,
  queuePlayerKey,
  queueTournamentKey,
} from '@vr-tournament/shared';
import { emitToUser } from '../socket/emitters.js';
import { enqueuePairNow } from './matchmaking-queue.js';
import type { Env } from '../config/env.js';

export interface RequeueOptions {
  tournamentId?: string | null;
  preferredVenueId?: string | null;
  preferredCity?: string | null;
  roundNumber?: number;
  bookingId?: string | null;
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

  if (meta.tournamentId) {
    const remaining = await redis.zcard(queueKey);
    if (remaining === 0) {
      await redis.srem(QUEUE_TOURNAMENT_INDEX, meta.tournamentId);
    }
  }
}

async function resolveRoundNumber(
  pool: Pool,
  userId: string,
  tournamentId: string | null,
  explicit?: number
): Promise<number> {
  if (explicit !== undefined) return explicit;
  if (!tournamentId) return 1;

  const result = await pool.query(
    `SELECT round_number FROM tournament_participants
     WHERE tournament_id = $1 AND user_id = $2`,
    [tournamentId, userId]
  );
  return result.rows[0]?.round_number ?? 1;
}

export async function requeuePlayer(
  pool: Pool,
  redis: RedisClient,
  userId: string,
  options: RequeueOptions = {},
  env?: Env
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

  const tournamentId = options.tournamentId ?? null;
  const roundNumber = await resolveRoundNumber(pool, userId, tournamentId, options.roundNumber);

  let bookingId = options.bookingId ?? null;
  if (tournamentId && !bookingId) {
    const reg = await pool.query(
      `SELECT booking_id FROM tournament_registrations
       WHERE tournament_id = $1 AND user_id = $2`,
      [tournamentId, userId]
    );
    bookingId = reg.rows[0]?.booking_id ?? null;
  }

  const joinedAt = Date.now();
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
    roundNumber,
    bookingId,
  });

  const multi = redis.multi();
  multi.zadd(queueKey, joinedAt, userId);
  multi.sadd(QUEUE_MEMBER, userId);
  multi.hset(queuePlayerKey(userId), hash);
  if (tournamentId) {
    multi.sadd(QUEUE_TOURNAMENT_INDEX, tournamentId);
  }
  await multi.exec();

  const queueSize = await redis.zcard(queueKey);
  emitToUser(userId, 'queue:joined', {
    position: null,
    queueSize,
    roundNumber,
  });

  if (env) {
    await enqueuePairNow(env, tournamentId);
  }

  return true;
}
