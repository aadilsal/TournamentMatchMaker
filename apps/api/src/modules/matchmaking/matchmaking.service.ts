import type { Pool } from 'pg';
import type { JoinQueueInput, QueueStatus } from '@vr-tournament/shared';
import type { RedisClient } from '../../lib/redis.js';
import {
  QUEUE_GLOBAL,
  QUEUE_MEMBER,
  queuePlayerKey,
  queueTournamentKey,
} from '../../lib/queue-keys.js';
import { AppError } from '../../lib/response.js';
import { emitToUser } from '../../socket/emitters.js';

export interface QueuePlayerMeta {
  userId: string;
  skillTier: number;
  hasVr: boolean;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  joinedAt: number;
  tournamentId: string | null;
}

export class MatchmakingService {
  constructor(
    private pool: Pool,
    private redis: RedisClient
  ) {}

  private queueKey(tournamentId?: string | null) {
    return tournamentId ? queueTournamentKey(tournamentId) : QUEUE_GLOBAL;
  }

  async hasActiveMatch(userId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT id FROM matches
       WHERE (player1_id = $1 OR player2_id = $1)
         AND status IN ('pending_confirmation', 'confirmed', 'in_progress')
       LIMIT 1`,
      [userId]
    );
    return !!result.rows[0];
  }

  async join(userId: string, input: JoinQueueInput): Promise<QueueStatus> {
    const inMember = await this.redis.sismember(QUEUE_MEMBER, userId);
    if (inMember) {
      throw new AppError('CONFLICT', 'Already in queue', 409);
    }

    if (await this.hasActiveMatch(userId)) {
      throw new AppError('CONFLICT', 'You have an active match', 409);
    }

    if (input.tournamentId) {
      const reg = await this.pool.query(
        `SELECT id FROM tournament_registrations WHERE tournament_id = $1 AND user_id = $2`,
        [input.tournamentId, userId]
      );
      if (!reg.rows[0]) {
        throw new AppError('FORBIDDEN', 'Register for tournament before joining its queue', 403);
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

    const multi = this.redis.multi();
    multi.zadd(queueKey, joinedAt, userId);
    multi.sadd(QUEUE_MEMBER, userId);
    const latitude = user.latitude ?? '';
    const longitude = user.longitude ?? '';
    multi.hset(queuePlayerKey(userId), {
      userId,
      skillTier: String(user.skill_tier),
      hasVr: user.has_vr_headset ? '1' : '0',
      city: input.preferredCity ?? user.city ?? '',
      country: user.country ?? '',
      latitude: latitude === null || latitude === undefined ? '' : String(latitude),
      longitude: longitude === null || longitude === undefined ? '' : String(longitude),
      joinedAt: String(joinedAt),
      tournamentId: input.tournamentId ?? '',
    });
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
    if (!meta.userId) return null;
    return {
      userId: meta.userId,
      skillTier: parseInt(meta.skillTier, 10),
      hasVr: meta.hasVr === '1',
      city: meta.city || null,
      country: meta.country || null,
      latitude: meta.latitude ? parseFloat(meta.latitude) : null,
      longitude: meta.longitude ? parseFloat(meta.longitude) : null,
      joinedAt: parseInt(meta.joinedAt, 10),
      tournamentId: meta.tournamentId || null,
    };
  }
}
