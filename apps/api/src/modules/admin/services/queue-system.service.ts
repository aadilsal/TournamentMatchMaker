import type { Pool } from 'pg';
import type { RedisClient } from '../../../lib/redis.js';
import type { Env } from '../../../config/env.js';
import type { AdminQueueOverview, SystemHealth } from '@vr-tournament/shared';
import {
  parseQueuePlayerMeta,
  QUEUE_GLOBAL,
  QUEUE_MEMBER,
  QUEUE_TOURNAMENT_INDEX,
  queuePlayerKey,
  queueTournamentKey,
} from '@vr-tournament/shared';
import { writeAudit } from '../../../lib/audit.js';
import { removeFromQueue, requeuePlayer } from '../../../lib/requeue-player.js';
import { enqueuePairNow } from '../../../lib/matchmaking-queue.js';
import { TournamentsService } from '../../tournaments/tournaments.service.js';
import { matchConfirmKey } from '../../../lib/queue-keys.js';
import { releaseSlotLock } from '../../../lib/slot-lock.js';

export class AdminQueueService {
  constructor(
    private pool: Pool,
    private redis: RedisClient,
    private env: Env
  ) {}

  async getOverview(): Promise<AdminQueueOverview> {
    const globalSize = await this.redis.zcard(QUEUE_GLOBAL);
    const tournamentIds = await this.redis.smembers(QUEUE_TOURNAMENT_INDEX);
    const tournaments: AdminQueueOverview['tournaments'] = [];

    for (const tournamentId of tournamentIds) {
      const size = await this.redis.zcard(queueTournamentKey(tournamentId));
      if (size === 0) continue;
      const nameResult = await this.pool.query(
        `SELECT name FROM tournaments WHERE id = $1`,
        [tournamentId]
      );
      tournaments.push({
        tournamentId,
        name: nameResult.rows[0]?.name ?? tournamentId,
        size,
      });
    }

    const memberIds = await this.redis.smembers(QUEUE_MEMBER);
    const entries = [];

    for (const userId of memberIds) {
      const hash = await this.redis.hgetall(queuePlayerKey(userId));
      const meta = parseQueuePlayerMeta(hash);
      if (!meta) continue;

      const userResult = await this.pool.query(
        `SELECT username FROM users WHERE id = $1`,
        [userId]
      );
      let tournamentName: string | null = null;
      if (meta.tournamentId) {
        const t = await this.pool.query(`SELECT name FROM tournaments WHERE id = $1`, [
          meta.tournamentId,
        ]);
        tournamentName = t.rows[0]?.name ?? null;
      }

      entries.push({
        userId,
        username: userResult.rows[0]?.username ?? userId,
        skillTier: meta.skillTier,
        tournamentId: meta.tournamentId,
        tournamentName,
        preferredVenueId: meta.preferredVenueId,
        roundNumber: meta.roundNumber,
        waitSeconds: Math.floor((Date.now() - meta.joinedAt) / 1000),
        hasPlayedSolo: meta.hasPlayedSolo,
        soloTarget: meta.soloTarget,
      });
    }

    entries.sort((a, b) => b.waitSeconds - a.waitSeconds);

    return { globalSize, tournaments, entries };
  }

  async removePlayer(actorId: string, userId: string) {
    await removeFromQueue(this.redis, userId);
    await writeAudit(this.pool, {
      actorId,
      action: 'queue.remove',
      entityType: 'user',
      entityId: userId,
    });
  }

  async addPlayer(actorId: string, userId: string, tournamentId?: string) {
    await requeuePlayer(this.pool, this.redis, userId, { tournamentId }, this.env);
    await writeAudit(this.pool, {
      actorId,
      action: 'queue.add',
      entityType: 'user',
      entityId: userId,
      after: { tournamentId },
    });
  }

  async triggerPair(tournamentId?: string) {
    await enqueuePairNow(this.env, tournamentId ?? null);
    return { triggered: true };
  }
}

export class AdminSystemService {
  constructor(
    private pool: Pool,
    private redis: RedisClient,
    private env: Env
  ) {}

  async getHealth(): Promise<SystemHealth> {
    let database: SystemHealth['database'] = 'ok';
    let redis: SystemHealth['redis'] = 'ok';
    const tableCounts: Record<string, number> = {};

    try {
      await this.pool.query('SELECT 1');
      const tables = [
        'users',
        'venues',
        'time_slots',
        'bookings',
        'tournaments',
        'matches',
        'buybacks',
        'notifications',
      ];
      for (const table of tables) {
        const r = await this.pool.query(`SELECT COUNT(*)::int AS c FROM ${table}`);
        tableCounts[table] = r.rows[0].c;
      }
    } catch {
      database = 'error';
    }

    try {
      await this.redis.ping();
    } catch {
      redis = 'error';
    }

    return { database, redis, tableCounts };
  }

  async expireMatchesNow() {
    const expired = await this.pool.query(
      `SELECT id, time_slot_id FROM matches
       WHERE status = 'pending_confirmation' AND created_at < NOW() - INTERVAL '5 minutes'`
    );
    let count = 0;
    for (const match of expired.rows) {
      await this.pool.query(
        `UPDATE matches SET status = 'expired', updated_at = NOW() WHERE id = $1`,
        [match.id]
      );
      if (match.time_slot_id) {
        await releaseSlotLock(this.pool, this.redis, match.time_slot_id);
      }
      await this.redis.del(matchConfirmKey(match.id));
      count++;
    }
    return { expired: count };
  }

  async closeRound(tournamentId: string, roundNumber: number) {
    const tournaments = new TournamentsService(this.pool, this.redis, this.env);
    await tournaments.closeRound(tournamentId, roundNumber);
    return { closed: true };
  }
}
