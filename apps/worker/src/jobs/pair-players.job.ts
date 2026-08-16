import type { Job } from 'bullmq';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import type { QueuePairFailedEvent } from '@vr-tournament/shared';
import {
  findBestPair,
  pairKey,
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
import { emitBroadcast, emitToUser } from '../lib/socket-bridge.js';

interface SlotSearchHint {
  lat?: number;
  lng?: number;
  city?: string;
  venueId?: string;
  roundStartsAt?: Date;
  roundEndsAt?: Date;
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

  const roundClause = (baseParamCount: number) => {
    if (!hint.roundEndsAt) return { sql: '', params: [] as unknown[] };
    if (hint.roundStartsAt) {
      return {
        sql: ` AND ts.start_time >= GREATEST(NOW(), $${baseParamCount + 1}) AND ts.end_time <= $${baseParamCount + 2}`,
        params: [hint.roundStartsAt, hint.roundEndsAt],
      };
    }
    return {
      sql: ` AND ts.end_time <= $${baseParamCount + 1}`,
      params: [hint.roundEndsAt],
    };
  };

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
    const round = roundClause(1);
    return runQuery(
      `SELECT ts.id AS slot_id, ts.venue_id, ts.start_time, ts.end_time
       FROM time_slots ts
       JOIN venues v ON v.id = ts.venue_id
       WHERE v.id = $1 AND ${baseWhere}${round.sql}
       ORDER BY ts.start_time ASC LIMIT 1`,
      [hint.venueId, ...round.params]
    );
  }

  if (hint.lat !== undefined && hint.lng !== undefined) {
    const round = roundClause(2);
    return runQuery(
      `SELECT ts.id AS slot_id, ts.venue_id, ts.start_time, ts.end_time,
              ST_Distance(v.location::geography,
                ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS dist_m
       FROM time_slots ts
       JOIN venues v ON v.id = ts.venue_id
       WHERE ${baseWhere}${round.sql}
         AND ST_DWithin(v.location::geography,
           ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 50000)
       ORDER BY dist_m, ts.start_time ASC LIMIT 1`,
      [hint.lng, hint.lat, ...round.params]
    );
  }

  if (hint.city) {
    const round = roundClause(1);
    return runQuery(
      `SELECT ts.id AS slot_id, ts.venue_id, ts.start_time, ts.end_time
       FROM time_slots ts
       JOIN venues v ON v.id = ts.venue_id
       WHERE v.city ILIKE $1 AND ${baseWhere}${round.sql}
       ORDER BY ts.start_time ASC LIMIT 1`,
      [hint.city, ...round.params]
    );
  }

  return null;
}

/**
 * Any play window inside the round, regardless of where it is.
 *
 * Two VR players need a *time*, not a seat: they play from home, so no venue
 * capacity is consumed and no location has to match. Without this, a pair of VR
 * players who never picked a slot themselves — the case for anyone who only
 * registered — had no window at all, and a tournament match with no window is
 * rejected below. They sat in the queue forever with nothing to explain it.
 *
 * Deliberately not filtered on capacity or `status`: a slot that is full or
 * locked for venue players is still a perfectly good clock for two people
 * playing at home.
 */
async function findAnySlotInRound(
  client: import('pg').PoolClient,
  round: { startsAt: Date; endsAt: Date }
): Promise<BookingSlot | null> {
  const result = await client.query(
    `SELECT ts.id AS slot_id, ts.venue_id, ts.start_time, ts.end_time
     FROM time_slots ts
     JOIN venues v ON v.id = ts.venue_id
     WHERE v.active = true
       AND ts.end_time > NOW()
       AND ts.start_time >= $1
       AND ts.end_time <= $2
     ORDER BY ts.start_time ASC
     LIMIT 1`,
    [round.startsAt, round.endsAt]
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

function slotWithinRound(
  slot: BookingSlot,
  round: { startsAt: Date; endsAt: Date } | null
): boolean {
  if (!round) return true;
  return slot.startTime >= round.startsAt && slot.endTime <= round.endsAt;
}

async function resolveBookingSlot(
  client: import('pg').PoolClient,
  bookingId: string | null | undefined,
  round: { startsAt: Date; endsAt: Date } | null = null
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
  const slot = {
    slotId: row.slot_id,
    venueId: row.venue_id,
    startTime: row.start_time,
    endTime: row.end_time,
  };
  return slotWithinRound(slot, round) ? slot : null;
}

/**
 * The play window the player chose for this round. VR players hold one of these
 * without a booking, so it is the only way to give a VR-vs-VR match a slot.
 */
async function resolveChosenSlot(
  client: import('pg').PoolClient,
  slotId: string | null | undefined,
  round: { startsAt: Date; endsAt: Date } | null = null
): Promise<BookingSlot | null> {
  if (!slotId) return null;
  const result = await client.query(
    `SELECT ts.id AS slot_id, ts.venue_id, ts.start_time, ts.end_time
     FROM time_slots ts
     WHERE ts.id = $1 AND ts.end_time > NOW()`,
    [slotId]
  );
  const row = result.rows[0];
  if (!row) return null;
  const slot = {
    slotId: row.slot_id,
    venueId: row.venue_id,
    startTime: row.start_time,
    endTime: row.end_time,
  };
  return slotWithinRound(slot, round) ? slot : null;
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

/**
 * The outcome of one attempt to turn the best-scoring pair into a match.
 *
 * `skip` matters as much as `paired`: an attempt can fail for a reason that is
 * specific to those two players (their round is shut, neither has a window)
 * while the rest of the queue is perfectly pairable. Reporting that separately
 * from "nothing left to do" is what lets the drain move on instead of retrying
 * the same doomed pair until the job gives up.
 */
type PairAttempt =
  | { status: 'idle' }
  | { status: 'paired' }
  | { status: 'skip'; key: string };

async function pairInQueue(
  pool: Pool,
  redis: Redis,
  queueKey: string,
  tournamentId: string | null,
  notificationQueue: { add: (name: string, data: unknown, opts?: { jobId?: string }) => Promise<unknown> },
  excluded: Set<string>
): Promise<PairAttempt> {
  const members = await redis.zrange(queueKey, 0, -1);
  if (members.length < 2) return { status: 'idle' };

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
      slotStartAt: meta.slotStartAt ? parseInt(meta.slotStartAt, 10) : null,
      slotEndAt: meta.slotEndAt ? parseInt(meta.slotEndAt, 10) : null,
    });
  }

  const match = findBestPair(entries, Date.now(), excluded);
  if (!match) return { status: 'idle' };

  const { candidate, partner } = match;
  const key = pairKey(candidate.userId, partner.userId);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // The queue and the matches table are written in separate stores, so a
    // membership can outlive the match that should have removed it: a crash
    // between the two, or a player enrolled from another path in the instant
    // between the Redis removal and the commit. Pairing off a stale entry gives
    // one player two live matches at once, which nothing downstream can undo —
    // so the guard lives here, where the match row itself is being written.
    const busy = await client.query(
      `SELECT DISTINCT unnest(ARRAY[player1_id, player2_id]) AS user_id
       FROM matches
       WHERE status IN ('pending_confirmation', 'confirmed', 'in_progress')
         AND (player1_id = ANY($1) OR player2_id = ANY($1))`,
      [[candidate.userId, partner.userId]]
    );
    const busyIds = new Set<string>(
      busy.rows
        .map((r) => r.user_id as string)
        .filter((id) => id === candidate.userId || id === partner.userId)
    );
    if (busyIds.size > 0) {
      await client.query('ROLLBACK');
      for (const userId of busyIds) {
        await removeStaleQueueEntry(redis, queueKey, tournamentId, userId);
      }
      return { status: 'skip', key };
    }

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

    let roundWindow: { startsAt: Date; endsAt: Date } | null = null;
    if (tournamentId) {
      // Key the window off the round these two players are actually in, not the
      // tournament's current round. Those differ whenever a player is behind the
      // field — newly registered, or held back after an elimination — and the
      // mismatch was silent and fatal: the slot picker offers, and entry
      // accepts, slots inside the *player's* round, while this check demanded
      // the *tournament's* round. Every such entry was discarded here as
      // "no slots", leaving the player queued forever with nothing to explain it.
      // findBestPair only pairs equal round numbers, so either side serves.
      const pairRoundNumber = candidate.roundNumber;
      const roundResult = await client.query(
        `SELECT tr.starts_at, tr.ends_at
         FROM tournament_rounds tr
         WHERE tr.tournament_id = $1 AND tr.round_number = $2 AND tr.status = 'active'`,
        [tournamentId, pairRoundNumber]
      );
      if (roundResult.rows[0]) {
        roundWindow = {
          startsAt: roundResult.rows[0].starts_at,
          endsAt: roundResult.rows[0].ends_at,
        };
      } else {
        // No open round for these players. A tournament match belongs to a
        // round, and a match created after the round shut can never be scored —
        // both players would sit in it until it expired, unable to requeue.
        // Leave them in the queue; close-round will move them on.
        await client.query('ROLLBACK');
        return { status: 'skip', key };
      }
    }

    // Every tournament entry — VR included — carries the play window the player
    // chose for this round. A confirmed booking is the fallback for entries made
    // before slots were recorded per round; only those already hold venue
    // capacity, which decides whether the slot still needs locking below.
    const p1Booking = await resolveBookingSlot(client, p1Meta.bookingId, roundWindow);
    const p2Booking = await resolveBookingSlot(client, p2Meta.bookingId, roundWindow);
    const p1Slot = (await resolveChosenSlot(client, p1Meta.slotId, roundWindow)) ?? p1Booking;
    const p2Slot = (await resolveChosenSlot(client, p2Meta.slotId, roundWindow)) ?? p2Booking;

    // A player who is physically attending must play at their own venue, so
    // their slot wins. When both attend, or neither does, take the earlier one.
    let chosenSlot: BookingSlot | null;
    if (p1HasVr === p2HasVr) {
      chosenSlot = pickEarlierSlot(p1Slot, p2Slot);
    } else if (!p1HasVr) {
      chosenSlot = p1Slot ?? p2Slot;
    } else {
      chosenSlot = p2Slot ?? p1Slot;
    }

    if (!chosenSlot && needsVenue) {
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
        return { status: 'skip', key };
      }
      chosenSlot = await findAvailableSlot(client, {
        lat: matchPoint?.lat,
        lng: matchPoint?.lng,
        city: city || undefined,
        venueId: preferredVenueId,
        roundStartsAt: roundWindow?.startsAt,
        roundEndsAt: roundWindow?.endsAt,
      });
      if (!chosenSlot) {
        await client.query('ROLLBACK');
        await notifyPairFailed(
          redis,
          [candidate.userId, partner.userId],
          'no_slots',
          'No venue slots available nearby. Try a different time or venue.'
        );
        return { status: 'skip', key };
      }
    } else if (chosenSlot) {
      // Capacity is already accounted for only when the chosen slot is one an
      // attending player holds a confirmed booking for. A VR player's chosen
      // window carries no booking, so it still has to be locked if the other
      // player is turning up in person.
      usedExistingBooking =
        chosenSlot.slotId === p1Booking?.slotId || chosenSlot.slotId === p2Booking?.slotId;
    }

    // Neither player picked a window and neither needs a venue: both are playing
    // from home, so any window inside the round will do. This is the ordinary
    // case for two players who registered and left the scheduling to us.
    if (!chosenSlot && tournamentId && !needsVenue && roundWindow) {
      chosenSlot = await findAnySlotInRound(client, roundWindow);
    }

    // A tournament match with no window is unplayable — neither player could
    // ever submit a score against it.
    if (!chosenSlot && tournamentId) {
      await client.query('ROLLBACK');
      await notifyPairFailed(
        redis,
        [candidate.userId, partner.userId],
        'no_slots',
        'Pick a time slot for this round so we can schedule your match.'
      );
      return { status: 'skip', key };
    }

    if (chosenSlot) {
      slotId = chosenSlot.slotId;
      scheduledAt = chosenSlot.startTime;
      // Two VR players play from home — they share the window, not the venue.
      venueId = needsVenue ? chosenSlot.venueId : null;
    }

    // Only players who physically attend consume a seat at the venue — and
    // only in the slot they chose themselves. Since pairing no longer requires
    // the two windows to overlap, the match is anchored to one of them; seating
    // the other player there too would book them a seat at a time they never
    // picked, and take capacity from that venue.
    //
    // A player holding no window of their own is the exception: the slot below
    // was found *for this match*, so it is theirs by assignment and they do
    // attend it. Excluding them left every such match with nobody attending,
    // which skipped `finalizeMatchSlotBookings` — and that is the only thing
    // that takes a slot back out of `locked`. The slot stayed locked, and every
    // later match and booking was refused it.
    const seatsChosenSlot = (slot: BookingSlot | null) =>
      !!chosenSlot && (!slot || slot.slotId === chosenSlot.slotId);
    const attendingPlayerIds = [
      ...(p1HasVr || !seatsChosenSlot(p1Slot) ? [] : [candidate.userId]),
      ...(p2HasVr || !seatsChosenSlot(p2Slot) ? [] : [partner.userId]),
    ];

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

    // Only reserve venue capacity when the slot was picked for this match and
    // someone is actually attending it in person.
    if (slotId && !usedExistingBooking && needsVenue) {
      const locked = await lockSlot(client, redis, slotId, matchId);
      if (!locked) {
        await client.query('ROLLBACK');
        await notifyPairFailed(
          redis,
          [candidate.userId, partner.userId],
          'slot_lock_failed',
          'Could not reserve the venue slot. Retrying with another slot…'
        );
        return { status: 'skip', key };
      }
    }

    if (slotId && autoConfirm && attendingPlayerIds.length > 0) {
      await finalizeMatchSlotBookings(client, redis, slotId, attendingPlayerIds);
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
    // VR-vs-VR matches have no venue but still have a play window, so the slot
    // is looked up whenever one exists.
    if (slotId) {
      const v = await pool.query(
        `SELECT v.id, v.name, v.city, ts.start_time, ts.end_time
         FROM time_slots ts JOIN venues v ON v.id = ts.venue_id WHERE ts.id = $1`,
        [slotId]
      );
      if (v.rows[0]) {
        if (venueId) {
          venueInfo = { id: v.rows[0].id, name: v.rows[0].name, city: v.rows[0].city };
        }
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
        { jobId: `match-found~${matchId}~${playerId}` }
      );
    }

    // Brackets, participant lists and match tables are on screen for other
    // players and admins right now — refresh them without waiting for a poll.
    if (tournamentId) {
      await emitBroadcast(redis, 'tournament:updated', {
        tournamentId,
        reason: 'match_created',
      });
    }

    console.log(`Paired ${candidate.userId} vs ${partner.userId} → match ${matchId} (${matchStatus})`);
    return { status: 'paired' };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Pairing error:', err);
    await notifyPairFailed(
      redis,
      [candidate.userId, partner.userId],
      'pairing_error',
      'Something went wrong while creating your match. Still searching…'
    );
    // Set aside rather than aborting: whatever went wrong belongs to these two,
    // and everyone else behind them in the queue is still pairable.
    return { status: 'skip', key };
  } finally {
    client.release();
  }
}

/** Drop a membership that can no longer produce a match, leaving no orphans. */
async function removeStaleQueueEntry(
  redis: Redis,
  queueKey: string,
  tournamentId: string | null,
  userId: string
) {
  const multi = redis.multi();
  multi.zrem(queueKey, userId);
  multi.zrem(QUEUE_GLOBAL, userId);
  if (tournamentId) multi.zrem(queueTournamentKey(tournamentId), userId);
  multi.srem(QUEUE_MEMBER, userId);
  multi.del(queuePlayerKey(userId));
  await multi.exec();
  if (tournamentId) await cleanupTournamentIndex(redis, tournamentId, queueKey);
  console.log(`Dropped queue entry for ${userId}: already holds an active match`);
}

/**
 * Keep pairing until the queue has nothing left that can be matched.
 *
 * Pairs that fail for their own reasons are set aside for the rest of the pass
 * instead of ending it. Before this, `findBestPair` returned the same
 * highest-scoring pair on every call, so one unschedulable pair at the top of
 * the ranking stopped the drain dead — every other player in that queue went
 * unpaired for as long as those two stayed in it.
 */
async function drainQueue(
  pool: Pool,
  redis: Redis,
  queueKey: string,
  tournamentId: string | null,
  notificationQueue: { add: (name: string, data: unknown, opts?: { jobId?: string }) => Promise<unknown> }
) {
  let paired = 0;
  const excluded = new Set<string>();

  // Bounded so a pathological queue cannot hold the job open: every iteration
  // either creates a match or retires one pair from consideration.
  for (let attempt = 0; attempt < 500; attempt++) {
    const result = await pairInQueue(
      pool,
      redis,
      queueKey,
      tournamentId,
      notificationQueue,
      excluded
    );
    if (result.status === 'idle') break;
    if (result.status === 'skip') {
      excluded.add(result.key);
      continue;
    }
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
