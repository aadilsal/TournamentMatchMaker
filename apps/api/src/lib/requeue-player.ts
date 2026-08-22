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

  // Every tournament entry owns a play window. Recover it from the round the
  // player is in so requeues after a win/rematch keep a playable slot instead of
  // producing a match with no time slot at all.
  if (tournamentId && !slotId) {
    const roundSlot = await pool.query(
      `SELECT rs.time_slot_id, rs.venue_id, rs.booking_id, ts.start_time, ts.end_time
       FROM tournament_round_slots rs
       JOIN time_slots ts ON ts.id = rs.time_slot_id
       WHERE rs.tournament_id = $1 AND rs.user_id = $2
       ORDER BY (rs.round_number = $3) DESC, rs.round_number DESC
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
    // A solo innings belongs to the round it was played in, but nothing on the
    // row says which round that was — `solo_target` is per participant, not per
    // round. Reviving it unconditionally is what put a score on the board for a
    // player who had only just registered: a target left behind by an earlier
    // round (one that was never paired, so nothing consumed it) came back the
    // next time they entered, and pairing seeded it as their innings.
    //
    // `solo_played_at` inside the active round's window is what makes it this
    // round's innings. Anything else is a leftover, and it is erased rather
    // than merely ignored so the next entry cannot revive it either.
    const pRow = await pool.query(
      `SELECT tp.solo_target, tp.solo_played_at, tr.id IS NOT NULL AS is_current_round
       FROM tournament_participants tp
       LEFT JOIN tournament_rounds tr
         ON tr.tournament_id = tp.tournament_id
        AND tr.round_number = $3
        AND tr.status = 'active'
        AND tp.solo_played_at >= tr.starts_at
        AND tp.solo_played_at < tr.ends_at
       WHERE tp.tournament_id = $1 AND tp.user_id = $2`,
      [tournamentId, userId, roundNumber]
    );
    const pastInnings = pRow.rows[0];
    if (pastInnings?.solo_target != null && pastInnings.is_current_round) {
      hasPlayedSolo = true;
      soloTarget = pastInnings.solo_target;
      soloPlayedAt = new Date(pastInnings.solo_played_at).getTime();
    } else if (pastInnings?.solo_target != null && options.hasPlayedSolo !== true) {
      // Not the caller's own innings — `submitSoloTarget` passes its target in
      // explicitly and must never have it cleared out from under it.
      await pool.query(
        `UPDATE tournament_participants
         SET solo_target = NULL, solo_played_at = NULL, updated_at = NOW()
         WHERE tournament_id = $1 AND user_id = $2`,
        [tournamentId, userId]
      );
      hasPlayedSolo = false;
      soloTarget = null;
      soloPlayedAt = null;
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
