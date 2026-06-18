import type { Pool } from 'pg';
import type { JoinQueueInput, QueueStatus } from '@vr-tournament/shared';
import { buildQueuePlayerHash, parseQueuePlayerMeta } from '@vr-tournament/shared';
import type { RedisClient } from '../../lib/redis.js';
import {
  QUEUE_GLOBAL,
  QUEUE_MEMBER,
  queuePlayerKey,
  queueTournamentKey,
} from '../../lib/queue-keys.js';
import { AppError } from '../../lib/response.js';
import { emitToUser } from '../../socket/emitters.js';
import { hasActiveMatch } from '../../lib/requeue-player.js';

export type QueuePlayerMeta = NonNullable<ReturnType<typeof parseQueuePlayerMeta>>;

export class MatchmakingService {
  constructor(
    private pool: Pool,
    private redis: RedisClient
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

      if (!input.preferredVenueId) {
        throw new AppError('BAD_REQUEST', 'preferredVenueId is required for tournament queue', 400);
      }
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
      preferredVenueId: input.preferredVenueId,
    });

    const multi = this.redis.multi();
    multi.zadd(queueKey, joinedAt, userId);
    multi.sadd(QUEUE_MEMBER, userId);
    multi.hset(queuePlayerKey(userId), hash);
    await multi.exec();

    const status = await this.getStatus(userId);
    emitToUser(userId, 'queue:joined', {
      position: status.position ?? 1,
      queueSize: status.queueSize,
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

    return {
      inQueue: false,
      position: null,
      waitSeconds: 0,
      queueSize: 0,
      tournamentId: meta.tournamentId || null,
    };
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
    };
  }

  async getPlayerMeta(userId: string): Promise<QueuePlayerMeta | null> {
    const meta = await this.redis.hgetall(queuePlayerKey(userId));
    return parseQueuePlayerMeta(meta);
  }
}
