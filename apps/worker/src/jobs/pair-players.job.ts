import type { Job } from 'bullmq';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import type { WorkerEnv } from '../config/env.js';
import {
  MATCHMAKING_PAIR_LOCK,
  QUEUE_GLOBAL,
  QUEUE_MEMBER,
  matchConfirmKey,
  queuePlayerKey,
  queueTournamentKey,
} from '../lib/queue-keys.js';
import { acquireLock, releaseLock } from '../lib/redlock.js';
import { findPartner, type QueueEntry } from '../lib/pairing.js';
import { lockSlot, SLOT_LOCK_TTL_SEC } from '../lib/slot-lock.js';
import { emitToUser } from '../lib/socket-bridge.js';

interface SlotSearchHint {
  lat?: number;
  lng?: number;
  city?: string;
}

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

async function findAvailableSlot(
  client: import('pg').PoolClient,
  hint: SlotSearchHint
): Promise<{ slotId: string; venueId: string; startTime: Date; endTime: Date } | null> {
  const baseWhere = `
    v.active = true
    AND ts.status = 'available'
    AND ts.booked_count < ts.max_capacity
    AND ts.start_time > NOW()`;

  if (hint.lat !== undefined && hint.lng !== undefined) {
    const result = await client.query(
      `SELECT ts.id AS slot_id, ts.venue_id, ts.start_time, ts.end_time,
              ST_Distance(v.location::geography,
                ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS dist_m
       FROM time_slots ts
       JOIN venues v ON v.id = ts.venue_id
       WHERE ${baseWhere}
         AND ST_DWithin(v.location::geography,
           ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 50000)
       ORDER BY dist_m, ts.start_time ASC
       LIMIT 1`,
      [hint.lng, hint.lat]
    );
    const row = result.rows[0];
    if (row) {
      return {
        slotId: row.slot_id,
        venueId: row.venue_id,
        startTime: row.start_time,
        endTime: row.end_time,
      };
    }
  }

  if (hint.city) {
    const result = await client.query(
      `SELECT ts.id AS slot_id, ts.venue_id, ts.start_time, ts.end_time
       FROM time_slots ts
       JOIN venues v ON v.id = ts.venue_id
       WHERE v.city ILIKE $1
         AND ${baseWhere}
       ORDER BY ts.start_time ASC
       LIMIT 1`,
      [hint.city]
    );
    const row = result.rows[0];
    if (row) {
      return {
        slotId: row.slot_id,
        venueId: row.venue_id,
        startTime: row.start_time,
        endTime: row.end_time,
      };
    }
  }

  return null;
}

async function pairInQueue(
  pool: Pool,
  redis: Redis,
  env: WorkerEnv,
  queueKey: string,
  tournamentId: string | null,
  notificationQueue: { add: (name: string, data: unknown, opts?: { jobId?: string }) => Promise<unknown> }
) {
  const members = await redis.zrange(queueKey, 0, -1);
  if (members.length < 2) return;

  const entries: QueueEntry[] = [];
  for (const userId of members) {
    const meta = await redis.hgetall(queuePlayerKey(userId));
    entries.push({
      userId,
      joinedAt: parseInt(meta.joinedAt || '0', 10),
    });
  }

  entries.sort((a, b) => a.joinedAt - b.joinedAt);
  const candidate = entries[0];
  const others = entries.slice(1);
  const partner = findPartner(candidate, others);
  if (!partner) return;

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

    if (needsVenue) {
      const matchPoint = resolveMatchPoint(
        parseCoord(p1Meta.latitude),
        parseCoord(p1Meta.longitude),
        parseCoord(p2Meta.latitude),
        parseCoord(p2Meta.longitude)
      );
      const city = p1Meta.city || p2Meta.city;
      if (!matchPoint && !city) {
        await client.query('ROLLBACK');
        return;
      }
      const slot = await findAvailableSlot(client, {
        lat: matchPoint?.lat,
        lng: matchPoint?.lng,
        city: city || undefined,
      });
      if (!slot) {
        await client.query('ROLLBACK');
        return;
      }
      venueId = slot.venueId;
      slotId = slot.slotId;
      scheduledAt = slot.startTime;
    }

    const matchResult = await client.query(
      `INSERT INTO matches (tournament_id, player1_id, player2_id, venue_id, time_slot_id, status, scheduled_at)
       VALUES ($1, $2, $3, $4, $5, 'pending_confirmation', $6)
       RETURNING id`,
      [tournamentId, candidate.userId, partner.userId, venueId, slotId, scheduledAt]
    );
    const matchId = matchResult.rows[0].id;

    if (slotId) {
      const locked = await lockSlot(client, redis, slotId, matchId);
      if (!locked) {
        await client.query('ROLLBACK');
        return;
      }
    }

    const confirmDeadline = new Date(Date.now() + SLOT_LOCK_TTL_SEC * 1000);
    await redis.hset(matchConfirmKey(matchId), {
      deadline: confirmDeadline.toISOString(),
    });
    await redis.expire(matchConfirmKey(matchId), SLOT_LOCK_TTL_SEC);

    const multi = redis.multi();
    multi.zrem(queueKey, candidate.userId, partner.userId);
    multi.srem(QUEUE_MEMBER, candidate.userId, partner.userId);
    multi.del(queuePlayerKey(candidate.userId), queuePlayerKey(partner.userId));
    await multi.exec();

    await client.query('COMMIT');

    const users = await pool.query(
      `SELECT id, username, skill_tier FROM users WHERE id = ANY($1)`,
      [[candidate.userId, partner.userId]]
    );
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
        confirmDeadline: confirmDeadline.toISOString(),
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

    console.log(`Paired ${candidate.userId} vs ${partner.userId} → match ${matchId}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function processPairPlayersJob(
  _job: Job,
  pool: Pool,
  redis: Redis,
  env: WorkerEnv,
  notificationQueue: { add: (name: string, data: unknown, opts?: { jobId?: string }) => Promise<unknown> }
) {
  const acquired = await acquireLock(redis, MATCHMAKING_PAIR_LOCK);
  if (!acquired) return;

  try {
    await pairInQueue(pool, redis, env, QUEUE_GLOBAL, null, notificationQueue);

    const tournamentKeys = await redis.keys('queue:tournament:*');
    for (const key of tournamentKeys) {
      const tournamentId = key.replace('queue:tournament:', '');
      await pairInQueue(pool, redis, env, key, tournamentId, notificationQueue);
    }
  } finally {
    await releaseLock(redis, MATCHMAKING_PAIR_LOCK);
  }
}
