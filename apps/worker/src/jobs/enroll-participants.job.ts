import type { Job } from 'bullmq';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import {
  buildQueuePlayerHash,
  QUEUE_MEMBER,
  QUEUE_TOURNAMENT_INDEX,
  queuePlayerKey,
  queueTournamentKey,
} from '@vr-tournament/shared';
import { acquireLock, releaseLock } from '../lib/redlock.js';
import { emitBroadcast, emitToUser } from '../lib/socket-bridge.js';

/**
 * Puts the players of a live tournament into its matchmaking queue.
 *
 * Registering for a tournament and being in the matchmaking queue were two
 * entirely separate things, and nothing joined them up. `POST /register` (and
 * the admin equivalent) write `tournament_registrations` and
 * `tournament_participants` and stop there; the Redis queue was only ever
 * written by `POST /enter` and `POST /matchmaking/queue`. The lifecycle sweep
 * that flips a tournament to `in_progress` moved the status and nothing else.
 *
 * So a tournament could go live with a full field and an empty queue. Pairing
 * walks the queue, so it had nobody to pair; no match was created, no
 * `match:found` was emitted, no notification was sent, and
 * `GET /meta/matches/current` answered `inQueue: false` /
 * `soloTargetState: 'not_queued'` — which is also why no solo innings could be
 * played. Every symptom of "the tournament went live and nothing happened"
 * traces back to this one gap.
 *
 * This closes it: while a tournament is live and its round is open, every
 * participant who may still play and is not already accounted for is enrolled.
 * It runs on a schedule rather than only at the moment of transition, so it also
 * repairs a queue emptied by a Redis restart, a player enrolled while the worker
 * was down, and an admin who starts a tournament by hand.
 */

const ENROLL_LOCK = 'lock:matchmaking:enroll';

interface LiveRound {
  tournamentId: string;
  tournamentName: string;
  roundNumber: number;
  startsAt: Date;
  endsAt: Date;
}

interface Candidate {
  user_id: string;
  round_number: number;
  skill_tier: number;
  has_vr_headset: boolean;
  city: string | null;
  country: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  solo_target: number | null;
  solo_played_at: Date | null;
}

interface PlayWindow {
  slotId: string;
  venueId: string | null;
  bookingId: string | null;
  startAt: number;
  endAt: number;
}

type NotificationQueue = {
  add: (name: string, data: unknown, opts?: { jobId?: string }) => Promise<unknown>;
};

function toNumber(value: string | number | null): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * The window this player already holds for the round, if it is still usable.
 *
 * Their own round's slot wins; a slot carried over from an earlier round is the
 * fallback, and the booking made at registration is the last resort — that is
 * the only window a player who never opened the slot picker has. Anything
 * outside the round window or already over is ignored, because pairing would
 * discard it anyway.
 */
async function resolvePlayWindow(
  pool: Pool,
  round: LiveRound,
  userId: string
): Promise<PlayWindow | null> {
  const chosen = await pool.query(
    `SELECT ts.id AS slot_id, rs.venue_id, rs.booking_id, ts.start_time, ts.end_time
     FROM tournament_round_slots rs
     JOIN time_slots ts ON ts.id = rs.time_slot_id
     WHERE rs.tournament_id = $1 AND rs.user_id = $2
       AND ts.end_time > NOW()
       AND ts.start_time >= $3 AND ts.end_time <= $4
     ORDER BY (rs.round_number = $5) DESC, rs.round_number DESC
     LIMIT 1`,
    [round.tournamentId, userId, round.startsAt, round.endsAt, round.roundNumber]
  );
  const row = chosen.rows[0];
  if (row) {
    return {
      slotId: row.slot_id,
      venueId: row.venue_id ?? null,
      bookingId: row.booking_id ?? null,
      startAt: new Date(row.start_time).getTime(),
      endAt: new Date(row.end_time).getTime(),
    };
  }

  const booked = await pool.query(
    `SELECT ts.id AS slot_id, ts.venue_id, b.id AS booking_id, ts.start_time, ts.end_time
     FROM tournament_registrations reg
     JOIN bookings b ON b.id = reg.booking_id AND b.status = 'confirmed'
     JOIN time_slots ts ON ts.id = b.time_slot_id
     WHERE reg.tournament_id = $1 AND reg.user_id = $2
       AND ts.end_time > NOW()
       AND ts.start_time >= $3 AND ts.end_time <= $4`,
    [round.tournamentId, userId, round.startsAt, round.endsAt]
  );
  const bookedRow = booked.rows[0];
  if (!bookedRow) return null;

  // Record it as this round's slot so every other reader — pairing, the queue
  // join check, the slot picker's default — sees the same window this does.
  await pool.query(
    `INSERT INTO tournament_round_slots
       (tournament_id, user_id, round_number, time_slot_id, venue_id, booking_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (tournament_id, user_id, round_number) DO NOTHING`,
    [
      round.tournamentId,
      userId,
      round.roundNumber,
      bookedRow.slot_id,
      bookedRow.venue_id,
      bookedRow.booking_id,
    ]
  );

  return {
    slotId: bookedRow.slot_id,
    venueId: bookedRow.venue_id ?? null,
    bookingId: bookedRow.booking_id ?? null,
    startAt: new Date(bookedRow.start_time).getTime(),
    endAt: new Date(bookedRow.end_time).getTime(),
  };
}

async function enrollTournament(
  pool: Pool,
  redis: Redis,
  notificationQueue: NotificationQueue,
  round: LiveRound
): Promise<number> {
  const candidates = await pool.query<Candidate>(
    `SELECT tp.user_id, tp.round_number, tp.solo_target, tp.solo_played_at,
            u.skill_tier, u.has_vr_headset, u.city, u.country, u.latitude, u.longitude
     FROM tournament_participants tp
     JOIN tournament_registrations reg
       ON reg.tournament_id = tp.tournament_id AND reg.user_id = tp.user_id
     JOIN users u ON u.id = tp.user_id
     WHERE tp.tournament_id = $1
       AND tp.status IN ('active', 'advanced')
       AND tp.round_number = $2
       AND NOT EXISTS (
         SELECT 1 FROM matches m
         WHERE (m.player1_id = tp.user_id OR m.player2_id = tp.user_id)
           AND m.status IN ('pending_confirmation', 'confirmed', 'in_progress')
       )`,
    [round.tournamentId, round.roundNumber]
  );

  let enrolled = 0;

  for (const player of candidates.rows) {
    if (await redis.sismember(QUEUE_MEMBER, player.user_id)) continue;

    const window = await resolvePlayWindow(pool, round, player.user_id);
    const joinedAt = Date.now();

    // Enrolled even without a window. Two players at home need only a time, and
    // pairing picks one inside the round for them; a player who has to attend a
    // venue is told what is missing through `queue:pair_failed` instead of
    // waiting in a queue they were never in.
    const hash = buildQueuePlayerHash({
      userId: player.user_id,
      skillTier: player.skill_tier,
      hasVr: player.has_vr_headset,
      city: player.city,
      country: player.country,
      latitude: toNumber(player.latitude),
      longitude: toNumber(player.longitude),
      joinedAt,
      tournamentId: round.tournamentId,
      preferredVenueId: window?.venueId ?? null,
      roundNumber: player.round_number,
      bookingId: window?.bookingId ?? null,
      hasPlayedSolo: player.solo_target != null,
      soloTarget: player.solo_target,
      soloPlayedAt: player.solo_played_at ? new Date(player.solo_played_at).getTime() : null,
      slotId: window?.slotId ?? null,
      slotStartAt: window?.startAt ?? null,
      slotEndAt: window?.endAt ?? null,
    });

    const queueKey = queueTournamentKey(round.tournamentId);
    const multi = redis.multi();
    multi.zadd(queueKey, joinedAt, player.user_id);
    multi.sadd(QUEUE_MEMBER, player.user_id);
    multi.sadd(QUEUE_TOURNAMENT_INDEX, round.tournamentId);
    multi.hset(queuePlayerKey(player.user_id), hash);
    await multi.exec();

    enrolled++;

    const queueSize = await redis.zcard(queueKey);
    await emitToUser(redis, player.user_id, 'queue:joined', {
      position: null,
      queueSize,
      roundNumber: player.round_number,
    });
    await emitToUser(redis, player.user_id, 'queue:updated', {
      inQueue: true,
      queueSize,
      tournamentId: round.tournamentId,
    });

    // Once per player per round: the tournament being live and them being in
    // matchmaking for it is news exactly once.
    await notificationQueue.add(
      'dispatch',
      {
        userId: player.user_id,
        type: 'tournament_live',
        channels: ['in_app', 'email'],
        payload: {
          tournamentId: round.tournamentId,
          tournamentName: round.tournamentName,
          roundNumber: player.round_number,
          roundEndsAt: round.endsAt.toISOString(),
          needsSlot: !window,
        },
        idempotencyKey: `tournament-live:${round.tournamentId}:${player.round_number}:${player.user_id}`,
      },
      { jobId: `tournament-live~${round.tournamentId}~${player.round_number}~${player.user_id}` }
    );
  }

  if (enrolled > 0) {
    console.log(
      `Enrolled ${enrolled} player(s) into matchmaking for tournament ${round.tournamentId} round ${round.roundNumber}`
    );
    await emitBroadcast(redis, 'tournament:updated', {
      tournamentId: round.tournamentId,
      reason: 'entered',
    });
  }

  return enrolled;
}

export async function processEnrollParticipantsJob(
  _job: Job,
  pool: Pool,
  redis: Redis,
  notificationQueue: NotificationQueue
): Promise<void> {
  // One enroller at a time. This does not take the pairing lock: pairing guards
  // itself against a queue entry whose player already holds a match, so the two
  // can safely run side by side, and sharing a lock would let a long drain
  // starve enrolment.
  const acquired = await acquireLock(redis, ENROLL_LOCK);
  if (!acquired) return;

  try {
    // Only rounds that are genuinely open right now. A round whose window has
    // not started yet is not a mistake — the tournament simply has not reached
    // it — and one that has ended belongs to close-round, not here.
    const live = await pool.query(
      `SELECT t.id, t.name, tr.round_number, tr.starts_at, tr.ends_at
       FROM tournaments t
       JOIN tournament_rounds tr
         ON tr.tournament_id = t.id AND tr.round_number = t.current_round_number
       WHERE t.status = 'in_progress'
         AND t.phase = 'normal'
         AND tr.status = 'active'
         AND tr.starts_at <= NOW()
         AND tr.ends_at > NOW()`
    );

    for (const row of live.rows) {
      try {
        await enrollTournament(pool, redis, notificationQueue, {
          tournamentId: row.id,
          tournamentName: row.name,
          roundNumber: row.round_number,
          startsAt: row.starts_at,
          endsAt: row.ends_at,
        });
      } catch (err) {
        // One tournament failing must not stop the rest being enrolled.
        console.error(`Enrolment failed for tournament ${row.id}:`, err);
      }
    }
  } finally {
    await releaseLock(redis, ENROLL_LOCK);
  }
}
