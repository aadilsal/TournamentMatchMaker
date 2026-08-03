import type { Pool } from 'pg';
import type { JoinQueueInput, QueueStatus } from '@vr-tournament/shared';
import {
  buildQueuePlayerHash,
  parseQueuePlayerMeta,
  QUEUE_MEMBER,
  QUEUE_TOURNAMENT_INDEX,
  queuePlayerKey,
  queueTournamentKey,
} from '@vr-tournament/shared';
import type { RedisClient } from '../../lib/redis.js';
import {
  QUEUE_GLOBAL,
} from '../../lib/queue-keys.js';
import { AppError } from '../../lib/response.js';
import { emitToUser } from '../../socket/emitters.js';
import { emitQueueUpdated } from '../../socket/sync-events.js';
import { hasActiveMatch } from '../../lib/requeue-player.js';
import { enqueuePairNow } from '../../lib/matchmaking-queue.js';
import { assertNoOtherLiveTournament } from '../../lib/live-participation.js';
import type { Env } from '../../config/env.js';

export type QueuePlayerMeta = NonNullable<ReturnType<typeof parseQueuePlayerMeta>>;

export class MatchmakingService {
  constructor(
    private pool: Pool,
    private redis: RedisClient,
    private env: Env
  ) {}

  private queueKey(tournamentId?: string | null) {
    return tournamentId ? queueTournamentKey(tournamentId) : QUEUE_GLOBAL;
  }

  async join(userId: string, input: JoinQueueInput): Promise<QueueStatus> {
    const inMember = await this.redis.sismember(QUEUE_MEMBER, userId);
    if (inMember) {
      throw new AppError('CONFLICT', 'Already in queue', 409);
    }

    if (await hasActiveMatch(this.pool, userId)) {
      throw new AppError('CONFLICT', 'You have an active match', 409);
    }

    if (input.tournamentId) {
      const reg = await this.pool.query(
        `SELECT tr.id, tp.status FROM tournament_registrations tr
         LEFT JOIN tournament_participants tp ON tp.tournament_id = tr.tournament_id AND tp.user_id = tr.user_id
         WHERE tr.tournament_id = $1 AND tr.user_id = $2`,
        [input.tournamentId, userId]
      );
      if (!reg.rows[0]) {
        throw new AppError('FORBIDDEN', 'Register for tournament before joining its queue', 403);
      }
      const status = reg.rows[0].status;
      if (status && !['active', 'advanced'].includes(status)) {
        throw new AppError('FORBIDDEN', 'You are eliminated from this tournament', 403);
      }

      // One live tournament at a time — the queue is another way in, so it needs
      // the same guard as POST /tournaments/:id/enter. Both now share
      // lib/live-participation.ts; they used to be written separately and
      // contradicted each other, so a player could pass one and be refused by
      // the other.
      await assertNoOtherLiveTournament(this.pool, userId, input.tournamentId);
    }

    if (input.preferredVenueId) {
      const venue = await this.pool.query(
        `SELECT id FROM venues WHERE id = $1 AND active = TRUE`,
        [input.preferredVenueId]
      );
      if (!venue.rows[0]) {
        throw new AppError('BAD_REQUEST', 'Invalid venue', 400);
      }
    }

    const userResult = await this.pool.query(
      `SELECT skill_tier, has_vr_headset, city, country, latitude, longitude FROM users WHERE id = $1`,
      [userId]
    );
    const user = userResult.rows[0];
    if (!user) throw new AppError('NOT_FOUND', 'User not found', 404);

    if (!user.has_vr_headset && input.tournamentId && !input.preferredVenueId) {
      throw new AppError('BAD_REQUEST', 'preferredVenueId is required for venue players', 400);
    }

    let roundNumber = 1;
    let slotId: string | null = null;
    let slotStartAt: number | null = null;
    let slotEndAt: number | null = null;
    let bookingId: string | null = null;
    let preferredVenueId = input.preferredVenueId ?? null;

    if (input.tournamentId) {
      const pResult = await this.pool.query(
        `SELECT round_number FROM tournament_participants
         WHERE tournament_id = $1 AND user_id = $2`,
        [input.tournamentId, userId]
      );
      roundNumber = pResult.rows[0]?.round_number ?? 1;

      // A tournament match needs a play window for both players — VR included.
      //
      // The slot must also sit inside the active round's window, because that is
      // what the pairing worker enforces (`slotWithinRound`). Accepting a merely
      // in-future slot here let players join the queue with a window the pairer
      // would never match, so they waited in "Finding opponent…" forever with
      // nothing to tell them why.
      const slotRow = await this.pool.query(
        `SELECT rs.time_slot_id, rs.venue_id, rs.booking_id, ts.start_time, ts.end_time
         FROM tournament_round_slots rs
         JOIN time_slots ts ON ts.id = rs.time_slot_id
         JOIN tournaments t ON t.id = rs.tournament_id
         LEFT JOIN tournament_rounds tr
           ON tr.tournament_id = t.id
          AND tr.round_number = t.current_round_number
          AND tr.status = 'active'
         WHERE rs.tournament_id = $1 AND rs.user_id = $2 AND ts.end_time > NOW()
           AND (tr.id IS NULL OR (ts.start_time >= tr.starts_at AND ts.end_time <= tr.ends_at))
         ORDER BY (rs.round_number = $3) DESC, rs.round_number DESC
         LIMIT 1`,
        [input.tournamentId, userId, roundNumber]
      );
      const rs = slotRow.rows[0];
      if (!rs) {
        throw new AppError(
          'BAD_REQUEST',
          'Pick a time slot inside this round’s play window before entering',
          400
        );
      }
      slotId = rs.time_slot_id;
      slotStartAt = new Date(rs.start_time).getTime();
      slotEndAt = new Date(rs.end_time).getTime();
      bookingId = rs.booking_id ?? null;
      preferredVenueId = preferredVenueId ?? rs.venue_id ?? null;
    }

    const joinedAt = Date.now();
    const queueKey = this.queueKey(input.tournamentId);

    const hash = buildQueuePlayerHash({
      userId,
      skillTier: user.skill_tier,
      hasVr: user.has_vr_headset,
      city: input.preferredCity ?? user.city,
      country: user.country,
      latitude: user.latitude,
      longitude: user.longitude,
      joinedAt,
      tournamentId: input.tournamentId,
      preferredVenueId,
      roundNumber,
      bookingId,
      slotId,
      slotStartAt,
      slotEndAt,
    });

    const multi = this.redis.multi();
    multi.zadd(queueKey, joinedAt, userId);
    multi.sadd(QUEUE_MEMBER, userId);
    multi.hset(queuePlayerKey(userId), hash);
    if (input.tournamentId) {
      multi.sadd(QUEUE_TOURNAMENT_INDEX, input.tournamentId);
    }
    await multi.exec();

    await enqueuePairNow(this.env, input.tournamentId ?? null);

    const status = await this.getStatus(userId);
    emitToUser(userId, 'queue:joined', {
      position: status.position ?? 1,
      queueSize: status.queueSize,
    });
    emitQueueUpdated(userId, {
      inQueue: true,
      position: status.position,
      queueSize: status.queueSize,
      tournamentId: status.tournamentId,
    });
    return status;
  }

  async leave(userId: string): Promise<QueueStatus> {
    const meta = await this.redis.hgetall(queuePlayerKey(userId));
    const queueKey = this.queueKey(meta.tournamentId || null);

    const multi = this.redis.multi();
    multi.zrem(queueKey, userId);
    multi.srem(QUEUE_MEMBER, userId);
    multi.del(queuePlayerKey(userId));
    await multi.exec();

    if (meta.tournamentId) {
      const remaining = await this.redis.zcard(queueKey);
      if (remaining === 0) {
        await this.redis.srem(QUEUE_TOURNAMENT_INDEX, meta.tournamentId);
      }
    }

    const status = {
      inQueue: false,
      position: null,
      waitSeconds: 0,
      queueSize: 0,
      tournamentId: meta.tournamentId || null,
      roundNumber: null,
    };
    emitQueueUpdated(userId, {
      inQueue: false,
      tournamentId: status.tournamentId,
    });
    return status;
  }

  async getStatus(userId: string): Promise<QueueStatus> {
    const inMember = await this.redis.sismember(QUEUE_MEMBER, userId);
    if (!inMember) {
      return {
        inQueue: false,
        position: null,
        waitSeconds: 0,
        queueSize: 0,
        tournamentId: null,
        roundNumber: null,
      };
    }

    const meta = await this.redis.hgetall(queuePlayerKey(userId));
    const queueKey = this.queueKey(meta.tournamentId || null);
    const rank = await this.redis.zrank(queueKey, userId);
    const queueSize = await this.redis.zcard(queueKey);
    const joinedAt = parseInt(meta.joinedAt || '0', 10);

    return {
      inQueue: true,
      position: rank !== null ? rank + 1 : null,
      waitSeconds: joinedAt ? Math.floor((Date.now() - joinedAt) / 1000) : 0,
      queueSize,
      tournamentId: meta.tournamentId || null,
      roundNumber: parseInt(meta.roundNumber || '1', 10),
    };
  }

  async getPlayerMeta(userId: string): Promise<QueuePlayerMeta | null> {
    const meta = await this.redis.hgetall(queuePlayerKey(userId));
    return parseQueuePlayerMeta(meta);
  }
}
