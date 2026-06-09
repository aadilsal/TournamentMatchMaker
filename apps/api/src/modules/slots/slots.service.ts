import type { Pool } from 'pg';
import type { CreateSlotsInput } from '@vr-tournament/shared';
import { mapSlot } from '../../lib/mappers.js';
import { AppError } from '../../lib/response.js';

export class SlotsService {
  constructor(private pool: Pool) {}

  async listByVenueAndDate(venueId: string, date: string) {
    const venueCheck = await this.pool.query('SELECT id FROM venues WHERE id = $1', [venueId]);
    if (!venueCheck.rows[0]) {
      throw new AppError('NOT_FOUND', 'Venue not found', 404);
    }

    const result = await this.pool.query(
      `SELECT * FROM time_slots
       WHERE venue_id = $1
         AND start_time >= $2::date
         AND start_time < ($2::date + INTERVAL '1 day')
       ORDER BY start_time`,
      [venueId, date]
    );

    return result.rows.map(mapSlot);
  }

  async createBulk(venueId: string, input: CreateSlotsInput) {
    const venueCheck = await this.pool.query('SELECT id FROM venues WHERE id = $1', [venueId]);
    if (!venueCheck.rows[0]) {
      throw new AppError('NOT_FOUND', 'Venue not found', 404);
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const created = [];

      for (const slot of input.slots) {
        const result = await client.query(
          `INSERT INTO time_slots (venue_id, start_time, end_time, max_capacity)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (venue_id, start_time) DO NOTHING
           RETURNING *`,
          [venueId, slot.startTime, slot.endTime, slot.maxCapacity]
        );
        if (result.rows[0]) {
          created.push(mapSlot(result.rows[0]));
        }
      }

      await client.query('COMMIT');
      return created;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
