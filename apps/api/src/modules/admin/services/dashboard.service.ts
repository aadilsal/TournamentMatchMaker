import type { Pool } from 'pg';
import type { RedisClient } from '../../../lib/redis.js';
import type { AdminDashboardStats } from '@vr-tournament/shared';
import { QUEUE_MEMBER } from '@vr-tournament/shared';

export class AdminDashboardService {
  constructor(
    private pool: Pool,
    private redis: RedisClient
  ) {}

  async getStats(): Promise<AdminDashboardStats> {
    const [counts, matchCounts, bookingCounts, buybackCounts, notifFailed, queueSize] =
      await Promise.all([
        this.pool.query(`
          SELECT
            (SELECT COUNT(*)::int FROM users) AS users,
            (SELECT COUNT(*)::int FROM users WHERE role = 'player') AS players,
            (SELECT COUNT(*)::int FROM venues) AS venues,
            (SELECT COUNT(*)::int FROM venues WHERE active = TRUE) AS active_venues
        `),
        this.pool.query(`
          SELECT
            COUNT(*) FILTER (WHERE status IN ('pending_confirmation', 'confirmed', 'in_progress'))::int AS ongoing,
            COUNT(*) FILTER (WHERE status = 'confirmed' AND scheduled_at > NOW())::int AS upcoming,
            COUNT(*) FILTER (WHERE status IN ('completed', 'cancelled', 'expired'))::int AS past,
            COUNT(*)::int AS total
          FROM matches
        `),
        this.pool.query(`
          SELECT
            COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
            COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
            COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled
          FROM bookings
        `),
        this.pool.query(`
          SELECT
            COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
            COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
            COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
          FROM buybacks
        `),
        this.pool.query(
          `SELECT COUNT(*)::int AS c FROM notifications WHERE status = 'failed'`
        ),
        this.redis.scard(QUEUE_MEMBER),
      ]);

    const tournamentStatus = await this.pool.query(`
      SELECT status, COUNT(*)::int AS c FROM tournaments GROUP BY status
    `);
    const tournaments: AdminDashboardStats['tournaments'] = {
      draft: 0,
      open: 0,
      closed: 0,
      in_progress: 0,
      completed: 0,
    };
    for (const row of tournamentStatus.rows) {
      tournaments[row.status as keyof typeof tournaments] = row.c;
    }

    const c = counts.rows[0];
    const m = matchCounts.rows[0];
    const b = bookingCounts.rows[0];
    const bb = buybackCounts.rows[0];

    return {
      users: c.users,
      players: c.players,
      venues: c.venues,
      activeVenues: c.active_venues,
      tournaments,
      matches: {
        ongoing: m.ongoing,
        upcoming: m.upcoming,
        past: m.past,
        total: m.total,
      },
      bookings: {
        confirmed: b.confirmed,
        pending: b.pending,
        cancelled: b.cancelled,
      },
      buybacks: {
        completed: bb.completed,
        pending: bb.pending,
        failed: bb.failed,
      },
      queueSize: queueSize ?? 0,
      notificationsFailed: notifFailed.rows[0]?.c ?? 0,
    };
  }
}

export class AdminAuditService {
  constructor(private pool: Pool) {}

  async list(query: {
    entityType?: string;
    entityId?: string;
    actorId?: string;
    action?: string;
    limit: number;
    cursor?: string;
  }) {
    const params: unknown[] = [];
    let where = 'WHERE 1=1';

    if (query.entityType) {
      params.push(query.entityType);
      where += ` AND al.entity_type = $${params.length}`;
    }
    if (query.entityId) {
      params.push(query.entityId);
      where += ` AND al.entity_id = $${params.length}`;
    }
    if (query.actorId) {
      params.push(query.actorId);
      where += ` AND al.actor_id = $${params.length}`;
    }
    if (query.action) {
      params.push(`%${query.action}%`);
      where += ` AND al.action ILIKE $${params.length}`;
    }
    if (query.cursor) {
      params.push(query.cursor);
      where += ` AND al.id < $${params.length}`;
    }

    params.push(query.limit + 1);
    const limitIdx = params.length;

    const result = await this.pool.query(
      `SELECT al.*, u.username AS actor_username
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.actor_id
       ${where}
       ORDER BY al.created_at DESC, al.id DESC
       LIMIT $${limitIdx}`,
      params
    );

    const rows = result.rows;
    const hasMore = rows.length > query.limit;
    const items = (hasMore ? rows.slice(0, query.limit) : rows).map((row) => ({
      id: row.id,
      actorId: row.actor_id,
      actorUsername: row.actor_username,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      beforeData: row.before_data,
      afterData: row.after_data,
      createdAt: row.created_at.toISOString(),
    }));

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
    };
  }
}
