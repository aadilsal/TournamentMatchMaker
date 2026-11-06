import type { Pool } from 'pg';
import type { CreateSlotsInput } from '@vr-tournament/shared';
import { mapSlot } from '../../lib/mappers.js';
import { AppError } from '../../lib/response.js';

export class SlotsService {
  constructor(private pool: Pool) {}

  async listByVenueAndDate(venueId: string, date: string, tz = 'UTC') {
    const venueCheck = await this.pool.query('SELECT id FROM venues WHERE id = $1', [venueId]);
    if (!venueCheck.rows[0]) {
      throw new AppError('NOT_FOUND', 'Venue not found', 404);
    }

    const result = await this.pool.query(
      `SELECT * FROM time_slots
       WHERE venue_id = $1
         AND start_time >= ($2::date::timestamp AT TIME ZONE $3)
         AND start_time < (($2::date + 1)::timestamp AT TIME ZONE $3)
       ORDER BY start_time`,
      [venueId, date, tz]
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
      // Serialises slot creation per venue so two requests cannot both pass the overlap check.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [venueId]);
      // An identical existing slot is skipped below (idempotent re-run); any other overlap is refused.
      const clash = await client.query(
        `SELECT s.start_time FROM time_slots s
         JOIN unnest($2::timestamptz[], $3::timestamptz[]) AS n(start_time, end_time)
           ON s.start_time < n.end_time AND s.end_time > n.start_time
          AND NOT (s.start_time = n.start_time AND s.end_time = n.end_time)
         WHERE s.venue_id = $1
         LIMIT 1`,
        [venueId, input.slots.map((s) => s.startTime), input.slots.map((s) => s.endTime)]
      );
      if (clash.rows[0]) {
        throw new AppError(
          'CONFLICT',
          `Overlaps an existing slot starting ${new Date(clash.rows[0].start_time).toISOString()}`,
          409
        );
      }
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
