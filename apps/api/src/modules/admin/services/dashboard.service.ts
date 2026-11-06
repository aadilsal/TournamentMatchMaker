import type { Pool } from 'pg';
import type { RedisClient } from '../../../lib/redis.js';
import type { AdminDashboardStats } from '@vr-tournament/shared';
import { QUEUE_MEMBER } from '@vr-tournament/shared';
import { MATCH_VIEW_FILTERS } from './matches.service.js';

export class AdminDashboardService {
  constructor(
    private pool: Pool,
    private redis: RedisClient
  ) {}

  /** Counts limited to the caller's scope; `null` ids mean unrestricted (superadmin). */
  async getStats(
    scope: { venueIds: string[] | null; tournamentIds: string[] | null } = {
      venueIds: null,
      tournamentIds: null,
    }
  ): Promise<AdminDashboardStats> {
    const all = scope.venueIds === null && scope.tournamentIds === null;
    const v = scope.venueIds ?? [];
    const t = scope.tournamentIds ?? [];
    const [counts, matchCounts, bookingCounts, buybackCounts, notifFailed, queueSize] =
      await Promise.all([
        this.pool.query(
          `WITH scoped AS (
             SELECT u.id, u.role FROM users u
             WHERE u.is_bot = FALSE AND ($1 OR u.id IN (
               SELECT b.user_id FROM bookings b
               JOIN time_slots ts ON ts.id = b.time_slot_id WHERE ts.venue_id = ANY($2::uuid[])
               UNION
               SELECT tr.user_id FROM tournament_registrations tr WHERE tr.tournament_id = ANY($3::uuid[])
             ))
           )
           SELECT
             (SELECT COUNT(*)::int FROM scoped) AS users,
             (SELECT COUNT(*)::int FROM scoped WHERE role = 'player') AS players,
             (SELECT COUNT(*)::int FROM venues WHERE $1 OR id = ANY($2::uuid[])) AS venues,
             (SELECT COUNT(*)::int FROM venues WHERE active = TRUE AND ($1 OR id = ANY($2::uuid[]))) AS active_venues`,
          [all, v, t]
        ),
        // Same predicates and tournament-only scope as GET /admin/matches?view=…
        this.pool.query(
          `SELECT
            COUNT(*) FILTER (WHERE ${MATCH_VIEW_FILTERS.ongoing})::int AS ongoing,
            COUNT(*) FILTER (WHERE ${MATCH_VIEW_FILTERS.upcoming})::int AS upcoming,
            COUNT(*) FILTER (WHERE ${MATCH_VIEW_FILTERS.past})::int AS past,
            COUNT(*)::int AS total
          FROM matches m
          LEFT JOIN time_slots ts ON ts.id = m.time_slot_id
          WHERE $1 OR m.tournament_id = ANY($2::uuid[])`,
          [all, t]
        ),
        this.pool.query(
          `SELECT
            COUNT(*) FILTER (WHERE b.status = 'confirmed')::int AS confirmed,
            COUNT(*) FILTER (WHERE b.status = 'pending')::int AS pending,
            COUNT(*) FILTER (WHERE b.status = 'cancelled')::int AS cancelled
          FROM bookings b JOIN time_slots ts ON ts.id = b.time_slot_id
          WHERE $1 OR ts.venue_id = ANY($2::uuid[])`,
          [all, v]
        ),
        this.pool.query(
          `SELECT
            COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
            COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
            COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
          FROM buybacks
          WHERE $1 OR tournament_id = ANY($2::uuid[])`,
          [all, t]
        ),
        // Notifications and the queue are superadmin-only sections.
        all
          ? this.pool.query(`SELECT COUNT(*)::int AS c FROM notifications WHERE status = 'failed'`)
          : Promise.resolve({ rows: [{ c: 0 }] }),
        all ? this.redis.scard(QUEUE_MEMBER) : Promise.resolve(0),
      ]);

    const tournamentStatus = await this.pool.query(
      `SELECT status, COUNT(*)::int AS c FROM tournaments
       WHERE $1 OR id = ANY($2::uuid[]) GROUP BY status`,
      [all, t]
    );
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
      // Keyset on the same columns the rows are ordered by. Comparing ids
      // alone (random UUIDs) let pages overlap and silently skip rows.
      params.push(query.cursor);
      where += ` AND (al.created_at, al.id) <
                     (SELECT c.created_at, c.id FROM audit_logs c WHERE c.id = $${params.length})`;
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
