import type { Pool } from 'pg';
import type { RedisClient } from '../../../lib/redis.js';
import type { Env } from '../../../config/env.js';
import type {
  AdminBroadcastNotificationInput,
  AdminBuybackListQuery,
  AdminCreateBuybackInput,
  AdminCreateNotificationInput,
  AdminNotificationListQuery,
  AdminUpdateBuybackInput,
} from '@vr-tournament/shared';
import { mapBuyback } from '../../../lib/mappers.js';
import { AppError } from '../../../lib/response.js';
import { writeAudit } from '../../../lib/audit.js';
import { enqueueNotification } from '../../../lib/bullmq.js';
import { refundBuybackPayment } from '../../../lib/stripe.js';

export class AdminBuybacksService {
  constructor(
    private pool: Pool,
    private redis: RedisClient,
    private env: Env
  ) {}

  async list(query: AdminBuybackListQuery) {
    const params: unknown[] = [];
    let where = 'WHERE 1=1';
    if (query.tournamentId) {
      params.push(query.tournamentId);
      where += ` AND b.tournament_id = $${params.length}`;
    }
    if (query.status) {
      params.push(query.status);
      where += ` AND b.status = $${params.length}`;
    }
    if (query.cursor) {
      params.push(query.cursor);
      where += ` AND b.id < $${params.length}`;
    }

    params.push(query.limit + 1);
    const limitIdx = params.length;

    const result = await this.pool.query(
      `SELECT b.*, u.username, t.name AS tournament_name
       FROM buybacks b
       JOIN users u ON u.id = b.user_id
       JOIN tournaments t ON t.id = b.tournament_id
       ${where}
       ORDER BY b.created_at DESC, b.id DESC
       LIMIT $${limitIdx}`,
      params
    );

    const rows = result.rows;
    const hasMore = rows.length > query.limit;
    const items = (hasMore ? rows.slice(0, query.limit) : rows).map((row) => ({
      ...mapBuyback(row),
      username: row.username,
      tournamentName: row.tournament_name,
    }));

    return { items, nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null };
  }

  async getById(id: string) {
    const result = await this.pool.query(
      `SELECT b.*, u.username, t.name AS tournament_name
       FROM buybacks b
       JOIN users u ON u.id = b.user_id
       JOIN tournaments t ON t.id = b.tournament_id
       WHERE b.id = $1`,
      [id]
    );
    if (!result.rows[0]) throw new AppError('NOT_FOUND', 'Buyback not found', 404);
    return {
      ...mapBuyback(result.rows[0]),
      username: result.rows[0].username,
      tournamentName: result.rows[0].tournament_name,
    };
  }

  async create(actorId: string, input: AdminCreateBuybackInput) {
    const result = await this.pool.query(
      `INSERT INTO buybacks (user_id, tournament_id, round_number, match_id, amount_cents, status)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        input.userId,
        input.tournamentId,
        input.roundNumber,
        input.matchId ?? null,
        input.amountCents,
        input.fulfill ? 'completed' : 'pending',
      ]
    );

    if (input.fulfill) {
      await this.pool.query(
        `UPDATE tournament_participants SET status = 'active', buyback_count = buyback_count + 1, updated_at = NOW()
         WHERE tournament_id = $1 AND user_id = $2`,
        [input.tournamentId, input.userId]
      );
    }

    await writeAudit(this.pool, {
      actorId,
      action: 'buyback.create',
      entityType: 'buyback',
      entityId: result.rows[0].id,
    });
    return mapBuyback(result.rows[0]);
  }

  async update(actorId: string, id: string, input: AdminUpdateBuybackInput) {
    if (!input.status) return this.getById(id);
    await this.pool.query(`UPDATE buybacks SET status = $1 WHERE id = $2`, [input.status, id]);
    await writeAudit(this.pool, {
      actorId,
      action: 'buyback.update',
      entityType: 'buyback',
      entityId: id,
      after: { status: input.status },
    });
    return this.getById(id);
  }

  async delete(actorId: string, id: string) {
    const before = await this.getById(id);
    await this.pool.query('DELETE FROM buybacks WHERE id = $1', [id]);
    await writeAudit(this.pool, {
      actorId,
      action: 'buyback.delete',
      entityType: 'buyback',
      entityId: id,
      before: before as unknown as Record<string, unknown>,
    });
  }

  async refund(actorId: string, id: string) {
    const buyback = await this.getById(id);
    if (!buyback.stripePaymentIntentId) {
      throw new AppError('BAD_REQUEST', 'No Stripe payment intent for this buyback', 400);
    }
    if (buyback.status !== 'completed') {
      throw new AppError('CONFLICT', 'Only completed buybacks can be refunded', 409);
    }

    await refundBuybackPayment(this.env, buyback.stripePaymentIntentId);

    await this.pool.query(`UPDATE buybacks SET status = 'failed' WHERE id = $1`, [id]);
    await this.pool.query(
      `UPDATE tournament_participants SET status = 'eliminated', updated_at = NOW()
       WHERE tournament_id = $1 AND user_id = $2`,
      [buyback.tournamentId, buyback.userId]
    );

    await writeAudit(this.pool, {
      actorId,
      action: 'buyback.refund',
      entityType: 'buyback',
      entityId: id,
      before: { stripePaymentIntentId: buyback.stripePaymentIntentId },
    });

    return this.getById(id);
  }
}

export class AdminNotificationsService {
  constructor(
    private pool: Pool,
    private env: Env
  ) {}

  async list(query: AdminNotificationListQuery) {
    const params: unknown[] = [];
    let where = 'WHERE 1=1';

    if (query.userId) {
      params.push(query.userId);
      where += ` AND n.user_id = $${params.length}`;
    }
    if (query.type) {
      params.push(query.type);
      where += ` AND n.type = $${params.length}`;
    }
    if (query.status) {
      params.push(query.status);
      where += ` AND n.status = $${params.length}`;
    }
    if (query.cursor) {
      params.push(query.cursor);
      where += ` AND n.id < $${params.length}`;
    }

    params.push(query.limit + 1);
    const limitIdx = params.length;

    const result = await this.pool.query(
      `SELECT n.*, u.username FROM notifications n
       LEFT JOIN users u ON u.id = n.user_id
       ${where}
       ORDER BY n.created_at DESC, n.id DESC
       LIMIT $${limitIdx}`,
      params
    );

    const rows = result.rows;
    const hasMore = rows.length > query.limit;
    const items = (hasMore ? rows.slice(0, query.limit) : rows).map((row) => ({
      id: row.id,
      userId: row.user_id,
      username: row.username,
      type: row.type,
      channel: row.channel,
      payload: row.payload,
      read: row.read,
      status: row.status,
      sentAt: row.sent_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
    }));

    return { items, nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null };
  }

  async create(actorId: string, input: AdminCreateNotificationInput) {
    const idempotencyKey = `admin:${Date.now()}:${input.userId}:${input.type}`;
    await enqueueNotification(this.env, {
      userId: input.userId,
      type: input.type,
      payload: input.payload,
      channels: [input.channel],
      idempotencyKey,
    });
    await writeAudit(this.pool, {
      actorId,
      action: 'notification.create',
      entityType: 'notification',
      entityId: input.userId,
      after: { type: input.type },
    });
    return { queued: true };
  }

  async broadcast(actorId: string, input: AdminBroadcastNotificationInput) {
    let userIds: string[] = [];

    if (input.tournamentId) {
      const r = await this.pool.query(
        `SELECT user_id FROM tournament_registrations WHERE tournament_id = $1`,
        [input.tournamentId]
      );
      userIds = r.rows.map((row) => row.user_id);
    } else if (input.venueId) {
      const r = await this.pool.query(
        `SELECT DISTINCT b.user_id FROM bookings b
         JOIN time_slots ts ON ts.id = b.time_slot_id
         WHERE ts.venue_id = $1 AND b.status = 'confirmed'`,
        [input.venueId]
      );
      userIds = r.rows.map((row) => row.user_id);
    } else {
      const r = await this.pool.query(`SELECT id FROM users WHERE role = 'player'`);
      userIds = r.rows.map((row) => row.id);
    }

    for (const userId of userIds) {
      await enqueueNotification(this.env, {
        userId,
        type: input.type,
        payload: input.payload,
        channels: [input.channel],
        idempotencyKey: `broadcast:${Date.now()}:${userId}:${input.type}`,
      });
    }

    await writeAudit(this.pool, {
      actorId,
      action: 'notification.broadcast',
      entityType: 'notification',
      after: { count: userIds.length, type: input.type },
    });

    return { queued: userIds.length };
  }

  async markRead(id: string) {
    await this.pool.query(`UPDATE notifications SET read = true WHERE id = $1`, [id]);
  }

  async delete(actorId: string, id: string) {
    await this.pool.query('DELETE FROM notifications WHERE id = $1', [id]);
    await writeAudit(this.pool, {
      actorId,
      action: 'notification.delete',
      entityType: 'notification',
      entityId: id,
    });
  }
}
