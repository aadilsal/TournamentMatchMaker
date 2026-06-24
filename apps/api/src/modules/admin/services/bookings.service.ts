import type { Pool } from 'pg';
import type { RedisClient } from '../../../lib/redis.js';
import type { AdminBookingListQuery, AdminCreateBookingInput, AdminUpdateBookingInput } from '@vr-tournament/shared';
import { mapBooking } from '../../../lib/mappers.js';
import { AppError } from '../../../lib/response.js';
import { writeAudit } from '../../../lib/audit.js';
import { BookingsService } from '../../bookings/bookings.service.js';

export class AdminBookingsService {
  private bookings: BookingsService;

  constructor(
    private pool: Pool,
    redis: RedisClient
  ) {
    this.bookings = new BookingsService(pool, redis);
  }

  async list(query: AdminBookingListQuery & { venueIds?: string[] | null }) {
    const params: unknown[] = [];
    let where = 'WHERE 1=1';

    if (query.userId) {
      params.push(query.userId);
      where += ` AND b.user_id = $${params.length}`;
    }
    if (query.venueId) {
      params.push(query.venueId);
      where += ` AND ts.venue_id = $${params.length}`;
    } else if (query.venueIds && query.venueIds.length > 0) {
      params.push(query.venueIds);
      where += ` AND ts.venue_id = ANY($${params.length})`;
    }
    if (query.status) {
      params.push(query.status);
      where += ` AND b.status = $${params.length}`;
    }
    if (query.search) {
      params.push(`%${query.search}%`);
      where += ` AND (u.username ILIKE $${params.length} OR u.email ILIKE $${params.length} OR v.name ILIKE $${params.length})`;
    }
    if (query.cursor) {
      params.push(query.cursor);
      where += ` AND b.id < $${params.length}`;
    }

    params.push(query.limit + 1);
    const limitIdx = params.length;

    const result = await this.pool.query(
      `SELECT b.*, u.username, u.email, v.name AS venue_name,
              ts.start_time, ts.end_time, ts.venue_id
       FROM bookings b
       JOIN users u ON u.id = b.user_id
       JOIN time_slots ts ON ts.id = b.time_slot_id
       JOIN venues v ON v.id = ts.venue_id
       ${where}
       ORDER BY b.created_at DESC, b.id DESC
       LIMIT $${limitIdx}`,
      params
    );

    const rows = result.rows;
    const hasMore = rows.length > query.limit;
    const items = (hasMore ? rows.slice(0, query.limit) : rows).map((row) => ({
      ...mapBooking(row),
      username: row.username,
      email: row.email,
      venueName: row.venue_name,
      slotStart: row.start_time.toISOString(),
      slotEnd: row.end_time.toISOString(),
      venueId: row.venue_id,
    }));

    return { items, nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null };
  }

  async getById(id: string) {
    const result = await this.pool.query(
      `SELECT b.*, u.username, u.email, v.name AS venue_name
       FROM bookings b
       JOIN users u ON u.id = b.user_id
       JOIN time_slots ts ON ts.id = b.time_slot_id
       JOIN venues v ON v.id = ts.venue_id
       WHERE b.id = $1`,
      [id]
    );
    if (!result.rows[0]) throw new AppError('NOT_FOUND', 'Booking not found', 404);
    const row = result.rows[0];
    return {
      ...mapBooking(row),
      username: row.username,
      email: row.email,
      venueName: row.venue_name,
    };
  }

  async create(actorId: string, input: AdminCreateBookingInput) {
    const booking = await this.bookings.create(input.userId, input.timeSlotId);
    await writeAudit(this.pool, {
      actorId,
      action: 'booking.create',
      entityType: 'booking',
      entityId: booking.id,
      after: booking as unknown as Record<string, unknown>,
    });
    return booking;
  }

  async update(actorId: string, id: string, input: AdminUpdateBookingInput) {
    const before = await this.getById(id);

    if (input.status === 'cancelled') {
      await this.bookings.cancel(before.userId, id);
      await writeAudit(this.pool, {
        actorId,
        action: 'booking.cancel',
        entityType: 'booking',
        entityId: id,
      });
      return this.getById(id);
    }

    if (input.status) {
      await this.pool.query(`UPDATE bookings SET status = $1 WHERE id = $2`, [input.status, id]);
    }

    await writeAudit(this.pool, {
      actorId,
      action: 'booking.update',
      entityType: 'booking',
      entityId: id,
      before: before as unknown as Record<string, unknown>,
    });
    return this.getById(id);
  }

  async delete(actorId: string, id: string) {
    const booking = await this.getById(id);
    if (booking.status !== 'cancelled') {
      await this.bookings.cancel(booking.userId, id);
    }
    await writeAudit(this.pool, {
      actorId,
      action: 'booking.delete',
      entityType: 'booking',
      entityId: id,
    });
  }
}
