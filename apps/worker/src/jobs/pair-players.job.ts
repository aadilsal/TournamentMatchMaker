import type { Job } from 'bullmq';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import type { QueuePairFailedEvent } from '@vr-tournament/shared';
import {
  findBestPair,
  type QueueEntry,
  QUEUE_GLOBAL,
  QUEUE_MEMBER,
  QUEUE_TOURNAMENT_INDEX,
  queuePlayerKey,
  queueTournamentKey,
  pickEarlierSlot,
  resolveChaseOnPair,
} from '@vr-tournament/shared';
import type { WorkerEnv } from '../config/env.js';
import { MATCHMAKING_PAIR_LOCK } from '../lib/queue-keys.js';
import { acquireLock, releaseLock } from '../lib/redlock.js';
import { lockSlot, finalizeMatchSlotBookings, SLOT_LOCK_TTL_SEC } from '../lib/slot-lock.js';
import { emitToUser } from '../lib/socket-bridge.js';

interface SlotSearchHint {
  lat?: number;
  lng?: number;
  city?: string;
  venueId?: string;
}

type BookingSlot = { slotId: string; venueId: string; startTime: Date; endTime: Date };

type PairFailureReason = QueuePairFailedEvent['reason'];

function parseCoord(value: string | undefined): number | null {
  if (!value) return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function resolveMatchPoint(
  p1Lat: number | null,
  p1Lng: number | null,
  p2Lat: number | null,
  p2Lng: number | null
): { lat: number; lng: number } | null {
  if (p1Lat !== null && p1Lng !== null && p2Lat !== null && p2Lng !== null) {
    return { lat: (p1Lat + p2Lat) / 2, lng: (p1Lng + p2Lng) / 2 };
  }
  if (p1Lat !== null && p1Lng !== null) return { lat: p1Lat, lng: p1Lng };
  if (p2Lat !== null && p2Lng !== null) return { lat: p2Lat, lng: p2Lng };
  return null;
}

async function notifyPairFailed(
  redis: Redis,
  userIds: string[],
  reason: PairFailureReason,
  message: string
) {
  const payload: QueuePairFailedEvent = { reason, message, retryable: true };
  await Promise.all(userIds.map((userId) => emitToUser(redis, userId, 'queue:pair_failed', payload)));
}

async function findAvailableSlot(
  client: import('pg').PoolClient,
  hint: SlotSearchHint
): Promise<BookingSlot | null> {
  const baseWhere = `
    v.active = true
    AND ts.status = 'available'
    AND ts.booked_count < ts.max_capacity
    AND ts.start_time > NOW()
    AND ts.end_time > NOW()`;

  const runQuery = async (sql: string, params: unknown[]) => {
    const result = await client.query(sql, params);
    const row = result.rows[0];
    if (!row) return null;
    return {
      slotId: row.slot_id,
      venueId: row.venue_id,
      startTime: row.start_time,
      endTime: row.end_time,
    };
  };

  if (hint.venueId) {
    return runQuery(
      `SELECT ts.id AS slot_id, ts.venue_id, ts.start_time, ts.end_time
       FROM time_slots ts
       JOIN venues v ON v.id = ts.venue_id
       WHERE v.id = $1 AND ${baseWhere}
       ORDER BY ts.start_time ASC LIMIT 1`,
      [hint.venueId]
    );
  }

  if (hint.lat !== undefined && hint.lng !== undefined) {
    return runQuery(
      `SELECT ts.id AS slot_id, ts.venue_id, ts.start_time, ts.end_time,
              ST_Distance(v.location::geography,
                ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS dist_m
       FROM time_slots ts
       JOIN venues v ON v.id = ts.venue_id
       WHERE ${baseWhere}
         AND ST_DWithin(v.location::geography,
           ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 50000)
       ORDER BY dist_m, ts.start_time ASC LIMIT 1`,
      [hint.lng, hint.lat]
    );
  }

  if (hint.city) {
    return runQuery(
      `SELECT ts.id AS slot_id, ts.venue_id, ts.start_time, ts.end_time
       FROM time_slots ts
       JOIN venues v ON v.id = ts.venue_id
       WHERE v.city ILIKE $1 AND ${baseWhere}
       ORDER BY ts.start_time ASC LIMIT 1`,
      [hint.city]
    );
  }

  return null;
}

async function resolveBookingSlot(
  client: import('pg').PoolClient,
  bookingId: string | null | undefined
): Promise<BookingSlot | null> {
  if (!bookingId) return null;
  const result = await client.query(
    `SELECT ts.id AS slot_id, ts.venue_id, ts.start_time, ts.end_time
     FROM bookings b
     JOIN time_slots ts ON ts.id = b.time_slot_id
     WHERE b.id = $1 AND b.status = 'confirmed' AND ts.end_time > NOW()`,
    [bookingId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    slotId: row.slot_id,
    venueId: row.venue_id,
    startTime: row.start_time,
    endTime: row.end_time,
  };
}

function soloInfoFromMeta(
  userId: string,
  meta: Record<string, string>
): { userId: string; target: number; playedAt: number } | null {
  if (meta.hasPlayedSolo !== '1' || !meta.soloTarget) return null;
  const target = parseInt(meta.soloTarget, 10);
  if (!Number.isFinite(target)) return null;
  return {
    userId,
    target,
    playedAt: parseInt(meta.soloPlayedAt || '0', 10) || 0,
  };
}

async function cleanupTournamentIndex(redis: Redis, tournamentId: string, queueKey: string) {
  const size = await redis.zcard(queueKey);
  if (size === 0) {
    await redis.srem(QUEUE_TOURNAMENT_INDEX, tournamentId);
  }
}

async function pairInQueue(
  pool: Pool,
  redis: Redis,
  queueKey: string,
  tournamentId: string | null,
  notificationQueue: { add: (name: string, data: unknown, opts?: { jobId?: string }) => Promise<unknown> }
): Promise<boolean> {
  const members = await redis.zrange(queueKey, 0, -1);
  if (members.length < 2) return false;

  const entries: QueueEntry[] = [];
  for (const userId of members) {
    const meta = await redis.hgetall(queuePlayerKey(userId));
    entries.push({
      userId,
      joinedAt: parseInt(meta.joinedAt || '0', 10),
      city: meta.city || '',
      skillTier: parseInt(meta.skillTier || '3', 10),
      roundNumber: parseInt(meta.roundNumber || '1', 10),
      hasPlayedSolo: meta.hasPlayedSolo === '1',
      soloPlayedAt: meta.soloPlayedAt ? parseInt(meta.soloPlayedAt, 10) : undefined,
      slotEndAt: meta.slotEndAt ? parseInt(meta.slotEndAt, 10) : null,
    });
  }

  const match = findBestPair(entries);
  if (!match) return false;

  const { candidate, partner } = match;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const p1Meta = await redis.hgetall(queuePlayerKey(candidate.userId));
    const p2Meta = await redis.hgetall(queuePlayerKey(partner.userId));
    const p1HasVr = p1Meta.hasVr === '1';
    const p2HasVr = p2Meta.hasVr === '1';
    const needsVenue = !p1HasVr || !p2HasVr;

    let venueId: string | null = null;
    let slotId: string | null = null;
    let scheduledAt: Date | null = null;
    let usedExistingBooking = false;

    const preferredVenueId = p1Meta.preferredVenueId || p2Meta.preferredVenueId || undefined;

    if (needsVenue) {
      const p1Booking = await resolveBookingSlot(client, p1Meta.bookingId);
      const p2Booking = await resolveBookingSlot(client, p2Meta.bookingId);
      const bookedSlot = pickEarlierSlot(p1Booking, p2Booking);

      if (bookedSlot) {
        venueId = bookedSlot.venueId;
        slotId = bookedSlot.slotId;
        scheduledAt = bookedSlot.startTime;
        usedExistingBooking = true;
      } else {
        const matchPoint = resolveMatchPoint(
          parseCoord(p1Meta.latitude),
          parseCoord(p1Meta.longitude),
          parseCoord(p2Meta.latitude),
          parseCoord(p2Meta.longitude)
        );
        const city = p1Meta.city || p2Meta.city;
        if (!matchPoint && !city && !preferredVenueId) {
          await client.query('ROLLBACK');
          await notifyPairFailed(
            redis,
            [candidate.userId, partner.userId],
            'venue_required',
            'Venue location is required to find a slot. Update your city or book a venue first.'
          );
          return false;
        }
        const slot = await findAvailableSlot(client, {
          lat: matchPoint?.lat,
          lng: matchPoint?.lng,
          city: city || undefined,
          venueId: preferredVenueId,
        });
        if (!slot) {
          await client.query('ROLLBACK');
          await notifyPairFailed(
            redis,
            [candidate.userId, partner.userId],
            'no_slots',
            'No venue slots available nearby. Try a different time or venue.'
          );
          return false;
        }
        venueId = slot.venueId;
        slotId = slot.slotId;
        scheduledAt = slot.startTime;
      }
    }

    const roundNumber = parseInt(p1Meta.roundNumber || p2Meta.roundNumber || '1', 10);
    let phase = 'normal';
    if (tournamentId) {
      const tResult = await client.query(`SELECT phase FROM tournaments WHERE id = $1`, [tournamentId]);
      if (tResult.rows[0]) {
        phase = tResult.rows[0].phase === 'knockout' ? 'knockout' : 'normal';
      }
    }

    const chase = resolveChaseOnPair(
      candidate.userId,
      partner.userId,
      soloInfoFromMeta(candidate.userId, p1Meta),
      soloInfoFromMeta(partner.userId, p2Meta)
    );

    const initialResult = {
      player1Score: null,
      player2Score: null,
      winnerId: null,
      player1Target: chase.player1Target,
      player2Target: chase.player2Target,
      chaseTarget: chase.chaseTarget,
      chasePlayerId: chase.chasePlayerId,
      source: 'meta' as const,
    };

    const autoConfirm = !!tournamentId;
    const matchStatus = autoConfirm ? 'confirmed' : 'pending_confirmation';

    const matchResult = await client.query(
      `INSERT INTO matches (tournament_id, player1_id, player2_id, venue_id, time_slot_id, status, scheduled_at, round_number, phase, result)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        tournamentId,
        candidate.userId,
        partner.userId,
        venueId,
        slotId,
        matchStatus,
        scheduledAt,
        roundNumber,
        phase,
        JSON.stringify(initialResult),
      ]
    );
    const matchId = matchResult.rows[0].id;

    if (slotId && !usedExistingBooking) {
      const locked = await lockSlot(client, redis, slotId, matchId);
      if (!locked) {
        await client.query('ROLLBACK');
        await notifyPairFailed(
          redis,
          [candidate.userId, partner.userId],
          'slot_lock_failed',
          'Could not reserve the venue slot. Retrying with another slot…'
        );
        return false;
      }
    }

    if (slotId && autoConfirm) {
      await finalizeMatchSlotBookings(client, redis, slotId, [
        candidate.userId,
        partner.userId,
      ]);
    }

    if (tournamentId) {
      await client.query(
        `UPDATE tournament_participants
         SET solo_target = NULL, solo_played_at = NULL, updated_at = NOW()
         WHERE tournament_id = $1 AND user_id = ANY($2)`,
        [tournamentId, [candidate.userId, partner.userId]]
      );
    }

    const multi = redis.multi();
    multi.zrem(queueKey, candidate.userId, partner.userId);
    multi.zrem(QUEUE_GLOBAL, candidate.userId, partner.userId);
    if (tournamentId) {
      multi.zrem(queueTournamentKey(tournamentId), candidate.userId, partner.userId);
    } else {
      const p1Tid = p1Meta.tournamentId;
      const p2Tid = p2Meta.tournamentId;
      if (p1Tid) multi.zrem(queueTournamentKey(p1Tid), candidate.userId);
      if (p2Tid) multi.zrem(queueTournamentKey(p2Tid), partner.userId);
    }
    multi.srem(QUEUE_MEMBER, candidate.userId, partner.userId);
    multi.del(queuePlayerKey(candidate.userId), queuePlayerKey(partner.userId));
    await multi.exec();

    await client.query('COMMIT');

    if (tournamentId) {
      await cleanupTournamentIndex(redis, tournamentId, queueKey);
    }

    const users = await pool.query(`SELECT id, username, skill_tier FROM users WHERE id = ANY($1)`, [
      [candidate.userId, partner.userId],
    ]);
    const userMap = new Map(users.rows.map((u) => [u.id, u]));

    let venueInfo: { id: string; name: string; city: string } | undefined;
    let slotInfo: { id: string; startTime: string; endTime: string } | undefined;
    if (venueId && slotId) {
      const v = await pool.query(
        `SELECT v.id, v.name, v.city, ts.start_time, ts.end_time
         FROM venues v JOIN time_slots ts ON ts.venue_id = v.id WHERE ts.id = $1`,
        [slotId]
      );
      if (v.rows[0]) {
        venueInfo = { id: v.rows[0].id, name: v.rows[0].name, city: v.rows[0].city };
        slotInfo = {
          id: slotId,
          startTime: v.rows[0].start_time.toISOString(),
          endTime: v.rows[0].end_time.toISOString(),
        };
      }
    }

    const confirmDeadline = new Date(Date.now() + SLOT_LOCK_TTL_SEC * 1000).toISOString();

    for (const [playerId, opponentId] of [
      [candidate.userId, partner.userId],
      [partner.userId, candidate.userId],
    ] as const) {
      const opponent = userMap.get(opponentId);
      const eventPayload = {
        matchId,
        opponent: {
          id: opponentId,
          username: opponent?.username ?? 'Unknown',
          skillTier: opponent?.skill_tier ?? 3,
        },
        venue: venueInfo,
        slot: slotInfo,
        chaseTarget: chase.chaseTarget,
        amChasing: chase.chasePlayerId === playerId,
        autoConfirmed: autoConfirm,
        confirmDeadline,
      };

      await emitToUser(redis, playerId, 'match:found', eventPayload);

      await notificationQueue.add(
        'dispatch',
        {
          userId: playerId,
          type: 'match_found',
          channels: ['in_app', 'email'],
          payload: eventPayload,
          idempotencyKey: `match-found:${matchId}:${playerId}`,
        },
        { jobId: `match-found:${matchId}:${playerId}` }
      );
    }

    console.log(`Paired ${candidate.userId} vs ${partner.userId} → match ${matchId} (${matchStatus})`);
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Pairing error:', err);
    await notifyPairFailed(
      redis,
      [candidate.userId, partner.userId],
      'pairing_error',
      'Something went wrong while creating your match. Still searching…'
    );
    return false;
  } finally {
    client.release();
  }
}

async function drainQueue(
  pool: Pool,
  redis: Redis,
  queueKey: string,
  tournamentId: string | null,
  notificationQueue: { add: (name: string, data: unknown, opts?: { jobId?: string }) => Promise<unknown> }
) {
  let paired = 0;
  while (await pairInQueue(pool, redis, queueKey, tournamentId, notificationQueue)) {
    paired++;
    if (paired >= 50) break;
  }
  return paired;
}

export async function processPairPlayersJob(
  _job: Job,
  pool: Pool,
  redis: Redis,
  _env: WorkerEnv,
  notificationQueue: { add: (name: string, data: unknown, opts?: { jobId?: string }) => Promise<unknown> },
  targetTournamentId?: string | null
) {
  const acquired = await acquireLock(redis, MATCHMAKING_PAIR_LOCK);
  if (!acquired) return;

  try {
    if (targetTournamentId) {
      await drainQueue(
        pool,
        redis,
        queueTournamentKey(targetTournamentId),
        targetTournamentId,
        notificationQueue
      );
      return;
    }

    await drainQueue(pool, redis, QUEUE_GLOBAL, null, notificationQueue);

    const tournamentIds = await redis.smembers(QUEUE_TOURNAMENT_INDEX);
    for (const tournamentId of tournamentIds) {
      await drainQueue(pool, redis, queueTournamentKey(tournamentId), tournamentId, notificationQueue);
    }
  } finally {
    await releaseLock(redis, MATCHMAKING_PAIR_LOCK);
  }
}
