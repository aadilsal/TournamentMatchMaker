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
  /** Chosen play window — set for VR players too, who hold a slot without a booking. */
  slotId?: string | null;
  slotStartAt?: number | null;
  slotEndAt?: number | null;
  /** Update queue metadata even when already in queue */
  refreshIfQueued?: boolean;
  /** Opponent this entry is pinned to after a draw — it will pair with nobody else. */
  rematchWith?: string | null;
  rematchId?: string | null;
  /**
   * Queue a tournament player who holds no window for their round. Only the
   * admin queue tools set this: every ordinary path reaches the queue through
   * the slot picker, and skipping the check there is what produced entries that
   * could be paired into a round the player had never scheduled themselves for.
   */
  allowWithoutSlot?: boolean;
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

  let slotId = options.slotId ?? null;
  let slotStartAt = options.slotStartAt ?? null;
  let slotEndAt = options.slotEndAt ?? null;
  let preferredVenueId = options.preferredVenueId ?? null;
  let hasPlayedSolo = options.hasPlayedSolo ?? false;
  let soloTarget = options.soloTarget ?? null;
  let soloPlayedAt = options.soloPlayedAt ?? null;

  // Every tournament entry owns a play window, and it belongs to one specific
  // round. Recovering the newest row regardless of round let a player be queued
  // for round 3 on the window they chose for round 2 — a date that had already
  // passed — so the lookup now demands a window for *this* round that has not
  // ended. A player without one is not queued at all: they are waiting on the
  // slot picker, and an entry made on their behalf here is exactly the silent
  // scheduling this flow exists to prevent.
  if (tournamentId && !slotId) {
    const roundSlot = await pool.query(
      `SELECT rs.time_slot_id, rs.venue_id, rs.booking_id, ts.start_time, ts.end_time
       FROM tournament_round_slots rs
       JOIN time_slots ts ON ts.id = rs.time_slot_id
       WHERE rs.tournament_id = $1 AND rs.user_id = $2
         AND rs.round_number = $3
         AND ts.end_time > NOW()
       LIMIT 1`,
      [tournamentId, userId, roundNumber]
    );
    const rs = roundSlot.rows[0];
    if (rs) {
      slotId = rs.time_slot_id;
      slotStartAt = new Date(rs.start_time).getTime();
      slotEndAt = new Date(rs.end_time).getTime();
      preferredVenueId = preferredVenueId ?? rs.venue_id ?? null;
      bookingId = bookingId ?? rs.booking_id ?? null;
    }
  }

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

  if (bookingId && slotId == null) {
    const slotRow = await pool.query(
      `SELECT ts.id, ts.venue_id, ts.start_time, ts.end_time FROM bookings b
       JOIN time_slots ts ON ts.id = b.time_slot_id
       WHERE b.id = $1 AND b.status = 'confirmed'`,
      [bookingId]
    );
    const row = slotRow.rows[0];
    if (row) {
      slotId = row.id;
      slotStartAt = slotStartAt ?? new Date(row.start_time).getTime();
      slotEndAt = slotEndAt ?? new Date(row.end_time).getTime();
      preferredVenueId = preferredVenueId ?? row.venue_id ?? null;
    }
  }

  // Checked after the booking fallback, so a player whose window is recorded
  // only as a confirmed booking still counts as having one.
  if (tournamentId && !slotId && !options.allowWithoutSlot) return false;

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
    preferredVenueId,
    roundNumber,
    bookingId,
    hasPlayedSolo,
    soloTarget,
    soloPlayedAt,
    slotId,
    slotStartAt,
    slotEndAt,
    rematchWith: options.rematchWith ?? null,
    rematchId: options.rematchId ?? null,
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
