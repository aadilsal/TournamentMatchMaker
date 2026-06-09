import type { Pool } from 'pg';
import type { DeclineMatchInput } from '@vr-tournament/shared';
import type { RedisClient } from '../../lib/redis.js';
import type { Env } from '../../config/env.js';
import { mapMatch } from '../../lib/mappers.js';
import { AppError } from '../../lib/response.js';
import {
  convertSlotLockToBooking,
  releaseSlotLock,
  SLOT_LOCK_TTL_SEC,
} from '../../lib/slot-lock.js';
import { matchConfirmKey, QUEUE_GLOBAL, QUEUE_MEMBER, queuePlayerKey, queueTournamentKey } from '../../lib/queue-keys.js';
import { enqueueNotification } from '../../lib/bullmq.js';

const MATCH_SELECT = `
  SELECT m.*,
         u1.username AS p1_username, u1.skill_tier AS p1_skill_tier, u1.has_vr_headset AS p1_has_vr,
         u2.username AS p2_username, u2.skill_tier AS p2_skill_tier, u2.has_vr_headset AS p2_has_vr,
         v.name AS venue_name, v.city AS venue_city, v.address AS venue_address,
         ts.start_time AS slot_start, ts.end_time AS slot_end
  FROM matches m
  JOIN users u1 ON u1.id = m.player1_id
  JOIN users u2 ON u2.id = m.player2_id
  LEFT JOIN venues v ON v.id = m.venue_id
  LEFT JOIN time_slots ts ON ts.id = m.time_slot_id
`;

export class MatchesService {
  constructor(
    private pool: Pool,
    private redis: RedisClient,
    private env?: Env
  ) {}

  async getById(matchId: string, userId?: string) {
    const result = await this.pool.query(`${MATCH_SELECT} WHERE m.id = $1`, [matchId]);
    const row = result.rows[0];
    if (!row) throw new AppError('NOT_FOUND', 'Match not found', 404);

    if (userId && row.player1_id !== userId && row.player2_id !== userId) {
      throw new AppError('FORBIDDEN', 'Not a participant in this match', 403);
    }

    return mapMatch(row);
  }

  async listByUser(userId: string) {
    const result = await this.pool.query(
      `${MATCH_SELECT}
       WHERE m.player1_id = $1 OR m.player2_id = $1
       ORDER BY m.created_at DESC
       LIMIT 50`,
      [userId]
    );
    return result.rows.map(mapMatch);
  }

  async confirm(matchId: string, userId: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const matchResult = await client.query(
        `${MATCH_SELECT} WHERE m.id = $1 FOR UPDATE OF m`,
        [matchId]
      );
      const match = matchResult.rows[0];
      if (!match) throw new AppError('NOT_FOUND', 'Match not found', 404);
      if (match.player1_id !== userId && match.player2_id !== userId) {
        throw new AppError('FORBIDDEN', 'Not a participant', 403);
      }
      if (match.status !== 'pending_confirmation') {
        throw new AppError('CONFLICT', 'Match is not awaiting confirmation', 409);
      }

      const confirmKey = matchConfirmKey(matchId);
      await this.redis.hset(confirmKey, userId, '1');
      await this.redis.expire(confirmKey, SLOT_LOCK_TTL_SEC);

      const confirms = await this.redis.hgetall(confirmKey);
      const p1Confirmed = confirms[match.player1_id] === '1';
      const p2Confirmed = confirms[match.player2_id] === '1';

      if (p1Confirmed && p2Confirmed) {
        if (match.time_slot_id) {
          await convertSlotLockToBooking(client, this.redis, match.time_slot_id, match.player1_id);
          if (match.player2_id !== match.player1_id) {
            await client.query(
              `INSERT INTO bookings (user_id, time_slot_id, status)
               VALUES ($1, $2, 'confirmed')
               ON CONFLICT (user_id, time_slot_id) DO UPDATE SET status = 'confirmed'`,
              [match.player2_id, match.time_slot_id]
            );
          }
        }

        await client.query(
          `UPDATE matches SET status = 'confirmed', updated_at = NOW() WHERE id = $1`,
          [matchId]
        );
        await this.redis.del(confirmKey);

        if (this.env) {
          for (const uid of [match.player1_id, match.player2_id]) {
            await enqueueNotification(this.env, {
              userId: uid,
              type: 'match_confirmed',
              channels: ['in_app', 'email'],
              payload: { matchId, venueId: match.venue_id, slotId: match.time_slot_id },
              idempotencyKey: `match-confirmed:${matchId}:${uid}`,
            });
          }
        }
      }

      await client.query('COMMIT');
      return this.getById(matchId, userId);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async decline(matchId: string, userId: string, input: DeclineMatchInput) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const matchResult = await client.query(
        `SELECT * FROM matches WHERE id = $1 FOR UPDATE`,
        [matchId]
      );
      const match = matchResult.rows[0];
      if (!match) throw new AppError('NOT_FOUND', 'Match not found', 404);
      if (match.player1_id !== userId && match.player2_id !== userId) {
        throw new AppError('FORBIDDEN', 'Not a participant', 403);
      }
      if (!['pending_confirmation', 'confirmed'].includes(match.status)) {
        throw new AppError('CONFLICT', 'Match cannot be declined', 409);
      }

      await client.query(
        `UPDATE matches SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
        [matchId]
      );

      await releaseSlotLock(this.pool, this.redis, match.time_slot_id);
      await this.redis.del(matchConfirmKey(matchId));

      const otherPlayer =
        match.player1_id === userId ? match.player2_id : match.player1_id;

      if (input.requeue) {
        const joinedAt = Date.now();
        const queueKey = match.tournament_id
          ? queueTournamentKey(match.tournament_id)
          : QUEUE_GLOBAL;

        for (const pid of [otherPlayer]) {
          const userResult = await client.query(
            `SELECT skill_tier, has_vr_headset, city, country FROM users WHERE id = $1`,
            [pid]
          );
          const u = userResult.rows[0];
          if (!u) continue;

          const multi = this.redis.multi();
          multi.zadd(queueKey, joinedAt, pid);
          multi.sadd(QUEUE_MEMBER, pid);
          multi.hset(queuePlayerKey(pid), {
            userId: pid,
            skillTier: String(u.skill_tier),
            hasVr: u.has_vr_headset ? '1' : '0',
            city: u.city ?? '',
            country: u.country ?? '',
            joinedAt: String(joinedAt),
            tournamentId: match.tournament_id ?? '',
          });
          await multi.exec();
        }
      }

      await client.query('COMMIT');

      if (this.env) {
        await enqueueNotification(this.env, {
          userId: otherPlayer,
          type: 'match_declined',
          channels: ['in_app', 'email'],
          payload: { matchId },
          idempotencyKey: `match-declined:${matchId}:${otherPlayer}`,
        });
      }

      return mapMatch({ ...match, status: 'cancelled' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
