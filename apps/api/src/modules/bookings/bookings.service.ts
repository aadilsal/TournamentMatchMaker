import type { Pool } from 'pg';
import { isSlotStartPast } from '@vr-tournament/shared';
import type { RedisClient } from '../../lib/redis.js';
import { mapBooking, mapSlot, mapVenue } from '../../lib/mappers.js';
import { AppError } from '../../lib/response.js';
import { emitBookingUpdated, emitSlotUpdated } from '../../socket/sync-events.js';

const SLOT_LOCK_TTL = 300;

function slotDateFromStartTime(startTime: Date | string): string {
  return new Date(startTime).toISOString().slice(0, 10);
}

export class BookingsService {
  constructor(
    private pool: Pool,
    private redis: RedisClient
  ) {}

  async create(userId: string, timeSlotId: string) {
    const lockKey = `slot:lock:${timeSlotId}:${userId}`;
    const existingLock = await this.redis.get(lockKey);
    if (!existingLock) {
      await this.redis.setex(lockKey, SLOT_LOCK_TTL, '1');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const slotResult = await client.query(
        'SELECT * FROM time_slots WHERE id = $1 FOR UPDATE',
        [timeSlotId]
      );

      const slot = slotResult.rows[0];
      if (!slot) {
        throw new AppError('NOT_FOUND', 'Time slot not found', 404);
      }

      if (slot.booked_count >= slot.max_capacity) {
        throw new AppError('CONFLICT', 'Time slot is full', 409);
      }

      if (slot.status === 'locked') {
        throw new AppError('CONFLICT', 'Time slot is currently locked', 409);
      }

      if (isSlotStartPast(slot.start_time)) {
        throw new AppError('BAD_REQUEST', 'Cannot book a time slot that has already started', 400);
      }

      const existingBooking = await client.query(
        `SELECT id FROM bookings
         WHERE user_id = $1 AND time_slot_id = $2 AND status != 'cancelled'`,
        [userId, timeSlotId]
      );

      if (existingBooking.rows[0]) {
        throw new AppError('CONFLICT', 'You already have a booking for this slot', 409);
      }

      const bookingResult = await client.query(
        `INSERT INTO bookings (user_id, time_slot_id, status)
         VALUES ($1, $2, 'confirmed')
         RETURNING *`,
        [userId, timeSlotId]
      );

      const newBookedCount = slot.booked_count + 1;
      const newStatus = newBookedCount >= slot.max_capacity ? 'full' : 'available';

      await client.query(
        'UPDATE time_slots SET booked_count = $1, status = $2 WHERE id = $3',
        [newBookedCount, newStatus, timeSlotId]
      );

      await client.query('COMMIT');

      await this.redis.del(lockKey);

      const booking = mapBooking(bookingResult.rows[0]);
      emitBookingUpdated(userId, { bookingId: booking.id, action: 'created' });
      emitSlotUpdated({
        venueId: slot.venue_id,
        slotId: timeSlotId,
        status: newStatus,
        date: slotDateFromStartTime(slot.start_time),
      });

      return booking;
    } catch (err) {
      await client.query('ROLLBACK');
      await this.redis.del(lockKey);
      throw err;
    } finally {
      client.release();
    }
  }

  async cancel(userId: string, bookingId: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const bookingResult = await client.query(
        `SELECT b.*, ts.booked_count, ts.max_capacity, ts.venue_id, ts.start_time, ts.status AS slot_status
         FROM bookings b
         JOIN time_slots ts ON ts.id = b.time_slot_id
         WHERE b.id = $1 AND b.user_id = $2
         FOR UPDATE OF b, ts`,
        [bookingId, userId]
      );

      const booking = bookingResult.rows[0];
      if (!booking) {
        throw new AppError('NOT_FOUND', 'Booking not found', 404);
      }

      if (booking.status === 'cancelled') {
        throw new AppError('CONFLICT', 'Booking is already cancelled', 409);
      }

      await client.query(
        `UPDATE bookings SET status = 'cancelled' WHERE id = $1`,
        [bookingId]
      );

      const newBookedCount = Math.max(0, booking.booked_count - 1);
      await client.query(
        `UPDATE time_slots SET booked_count = $1, status = 'available' WHERE id = $2`,
        [newBookedCount, booking.time_slot_id]
      );

      await client.query('COMMIT');

      const cancelled = mapBooking({ ...booking, status: 'cancelled' });
      emitBookingUpdated(userId, { bookingId, action: 'cancelled' });
      emitSlotUpdated({
        venueId: booking.venue_id,
        slotId: booking.time_slot_id,
        status: 'available',
        date: slotDateFromStartTime(booking.start_time),
      });

      return cancelled;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async listByUser(userId: string) {
    const result = await this.pool.query(
      `SELECT b.*,
              ts.id AS slot_id, ts.venue_id, ts.start_time, ts.end_time,
              ts.max_capacity, ts.booked_count, ts.status AS slot_status, ts.created_at AS slot_created_at,
              v.id AS venue_id, v.name AS venue_name, v.address, v.city, v.country,
              v.capacity, v.active, v.created_at AS venue_created_at, v.updated_at AS venue_updated_at,
              ST_Y(v.location) AS latitude, ST_X(v.location) AS longitude
       FROM bookings b
       JOIN time_slots ts ON ts.id = b.time_slot_id
       JOIN venues v ON v.id = ts.venue_id
       WHERE b.user_id = $1 AND b.status != 'cancelled'
       ORDER BY ts.start_time ASC`,
      [userId]
    );

    return result.rows.map((row) => ({
      ...mapBooking(row),
      slot: mapSlot({
        id: row.slot_id,
        venue_id: row.venue_id,
        start_time: row.start_time,
        end_time: row.end_time,
        max_capacity: row.max_capacity,
        booked_count: row.booked_count,
        status: row.slot_status,
        created_at: row.slot_created_at,
      }),
      venue: mapVenue({
        id: row.venue_id,
        name: row.venue_name,
        address: row.address,
        city: row.city,
        country: row.country,
        latitude: row.latitude,
        longitude: row.longitude,
        capacity: row.capacity,
        active: row.active,
        created_at: row.venue_created_at,
        updated_at: row.venue_updated_at,
      }),
    }));
  }
}
