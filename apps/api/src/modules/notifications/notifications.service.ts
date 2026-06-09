import type { Pool } from 'pg';
import type { NotificationListQuery } from '@vr-tournament/shared';
import { mapNotification } from '../../lib/mappers.js';
import { AppError } from '../../lib/response.js';

export class NotificationsService {
  constructor(private pool: Pool) {}

  async list(userId: string, query: NotificationListQuery) {
    const params: unknown[] = [userId];
    let where = `WHERE user_id = $1 AND channel = 'in_app'`;

    if (query.unreadOnly) {
      where += ` AND read = false`;
    }
    if (query.cursor) {
      params.push(query.cursor);
      where += ` AND id < $${params.length}`;
    }

    params.push(query.limit + 1);
    const limitIdx = params.length;

    const result = await this.pool.query(
      `SELECT * FROM notifications
       ${where}
       ORDER BY created_at DESC, id DESC
       LIMIT $${limitIdx}`,
      params
    );

    const rows = result.rows;
    const hasMore = rows.length > query.limit;
    const items = (hasMore ? rows.slice(0, query.limit) : rows).map(mapNotification);

    const unreadResult = await this.pool.query(
      `SELECT COUNT(*)::int AS count FROM notifications
       WHERE user_id = $1 AND channel = 'in_app' AND read = false`,
      [userId]
    );

    return {
      items,
      unreadCount: unreadResult.rows[0]?.count ?? 0,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
    };
  }

  async markRead(userId: string, notificationId: string) {
    const result = await this.pool.query(
      `UPDATE notifications SET read = true
       WHERE id = $1 AND user_id = $2 AND channel = 'in_app'
       RETURNING *`,
      [notificationId, userId]
    );
    if (!result.rows[0]) {
      throw new AppError('NOT_FOUND', 'Notification not found', 404);
    }
    return mapNotification(result.rows[0]);
  }

  async markAllRead(userId: string) {
    const result = await this.pool.query(
      `UPDATE notifications SET read = true
       WHERE user_id = $1 AND channel = 'in_app' AND read = false
       RETURNING id`,
      [userId]
    );
    return { updated: result.rowCount ?? 0 };
  }
}
