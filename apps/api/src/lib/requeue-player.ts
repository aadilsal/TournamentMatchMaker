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
import { emitQueueUpdated } from '../socket/sync-events.js';
import { enqueuePairNow } from './matchmaking-queue.js';
import type { Env } from '../config/env.js';

export interface RequeueOptions {
  tournamentId?: string | null;
  preferredVenueId?: string | null;
  preferredCity?: string | null;
  roundNumber?: number;
  bookingId?: string | null;
  hasPlayedSolo?: boolean;
  soloTarget?: number | null;
  soloPlayedAt?: number | null;
  slotEndAt?: number | null;
  /** Update queue metadata even when already in queue */
  refreshIfQueued?: boolean;
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
  if (inQueue && !options.refreshIfQueued) return false;

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

  let slotEndAt = options.slotEndAt ?? null;
  let hasPlayedSolo = options.hasPlayedSolo ?? false;
  let soloTarget = options.soloTarget ?? null;
  let soloPlayedAt = options.soloPlayedAt ?? null;

  if (tournamentId) {
    const pRow = await pool.query(
      `SELECT solo_target, solo_played_at FROM tournament_participants
       WHERE tournament_id = $1 AND user_id = $2`,
      [tournamentId, userId]
    );
    if (pRow.rows[0]?.solo_target != null) {
      hasPlayedSolo = true;
      soloTarget = pRow.rows[0].solo_target;
      soloPlayedAt = pRow.rows[0].solo_played_at
        ? new Date(pRow.rows[0].solo_played_at).getTime()
        : soloPlayedAt;
    }
  }

  if (bookingId && slotEndAt == null) {
    const slotRow = await pool.query(
      `SELECT ts.end_time FROM bookings b
       JOIN time_slots ts ON ts.id = b.time_slot_id
       WHERE b.id = $1 AND b.status = 'confirmed'`,
      [bookingId]
    );
    if (slotRow.rows[0]?.end_time) {
      slotEndAt = new Date(slotRow.rows[0].end_time).getTime();
    }
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
    hasPlayedSolo,
    soloTarget,
    soloPlayedAt,
    slotEndAt,
  });

  const playerKey = queuePlayerKey(userId);
  const multi = redis.multi();
  if (!inQueue) {
    multi.zadd(queueKey, joinedAt, userId);
    multi.sadd(QUEUE_MEMBER, userId);
    if (tournamentId) {
      multi.sadd(QUEUE_TOURNAMENT_INDEX, tournamentId);
    }
  }
  multi.hset(playerKey, hash);
  await multi.exec();

  const queueSize = await redis.zcard(queueKey);
  emitToUser(userId, 'queue:joined', {
    position: null,
    queueSize,
    roundNumber,
  });
  emitQueueUpdated(userId, {
    inQueue: true,
    queueSize,
    tournamentId: tournamentId ?? null,
  });

  if (env) {
    await enqueuePairNow(env, tournamentId);
  }

  return true;
}
