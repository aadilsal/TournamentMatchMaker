import type { Pool } from 'pg';
import type { RedisClient } from '../../../lib/redis.js';
import type {
  AdminAssignVenueAdminInput,
  AdminGenerateSlotsInput,
  AdminUpdateSlotInput,
  AdminUpdateVenueInput,
  AdminVenueListQuery,
  CreateSlotsInput,
  CreateVenueInput,
} from '@vr-tournament/shared';
import { mapSlot, mapVenue } from '../../../lib/mappers.js';
import { AppError } from '../../../lib/response.js';
import { writeAudit } from '../../../lib/audit.js';
import { releaseSlotLock } from '../../../lib/slot-lock.js';
import { VenuesService } from '../../venues/venues.service.js';
import { SlotsService } from '../../slots/slots.service.js';

export class AdminVenuesService {
  private venues: VenuesService;
  private slots: SlotsService;

  constructor(
    private pool: Pool,
    private redis: RedisClient
  ) {
    this.venues = new VenuesService(pool, redis);
    this.slots = new SlotsService(pool);
  }

  async list(query: AdminVenueListQuery & { venueIds?: string[] | null }) {
    if (query.venueIds !== null && query.venueIds !== undefined && query.venueIds.length === 0) {
      return { items: [], nextCursor: null };
    }

    const params: unknown[] = [];
    const conditions: string[] = [];

    if (query.active !== undefined) {
      params.push(query.active);
      conditions.push(`active = $${params.length}`);
    }
    if (query.venueIds?.length) {
      params.push(query.venueIds);
      conditions.push(`id = ANY($${params.length})`);
    }
    if (query.search) {
      params.push(`%${query.search}%`);
      conditions.push(
        `(name ILIKE $${params.length} OR city ILIKE $${params.length} OR country ILIKE $${params.length})`
      );
    }
    if (query.cursor) {
      params.push(query.cursor);
      conditions.push(`id < $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(query.limit + 1);
    const limitIdx = params.length;

    const result = await this.pool.query(
      `SELECT id, name, address, city, country, capacity, active, created_at, updated_at,
              ST_Y(location) AS latitude, ST_X(location) AS longitude
       FROM venues ${where} ORDER BY name ASC, id DESC LIMIT $${limitIdx}`,
      params
    );

    const rows = result.rows;
    const hasMore = rows.length > query.limit;
    const items = (hasMore ? rows.slice(0, query.limit) : rows).map(mapVenue);

    return { items, nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null };
  }

  getById(id: string) {
    return this.venues.getById(id);
  }

  async create(actorId: string, input: CreateVenueInput) {
    const venue = await this.venues.create(input);
    await writeAudit(this.pool, {
      actorId,
      action: 'venue.create',
      entityType: 'venue',
      entityId: venue.id,
      after: venue as unknown as Record<string, unknown>,
    });
    return venue;
  }

  async update(actorId: string, id: string, input: AdminUpdateVenueInput) {
    const before = await this.getById(id);
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (input.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(input.name);
    }
    if (input.address !== undefined) {
      fields.push(`address = $${idx++}`);
      values.push(input.address);
    }
    if (input.city !== undefined) {
      fields.push(`city = $${idx++}`);
      values.push(input.city);
    }
    if (input.country !== undefined) {
      fields.push(`country = $${idx++}`);
      values.push(input.country);
    }
    if (input.latitude !== undefined && input.longitude !== undefined) {
      fields.push(`location = ST_SetSRID(ST_MakePoint($${idx}, $${idx + 1}), 4326)`);
      values.push(input.longitude, input.latitude);
      idx += 2;
    }
    if (input.capacity !== undefined) {
      fields.push(`capacity = $${idx++}`);
      values.push(input.capacity);
    }
    if (input.active !== undefined) {
      fields.push(`active = $${idx++}`);
      values.push(input.active);
    }

    if (fields.length === 0) return before;

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await this.pool.query(
      `UPDATE venues SET ${fields.join(', ')} WHERE id = $${idx}
       RETURNING id, name, address, city, country, capacity, active, created_at, updated_at,
                 ST_Y(location) AS latitude, ST_X(location) AS longitude`,
      values
    );
    const venue = mapVenue(result.rows[0]);
    await writeAudit(this.pool, {
      actorId,
      action: 'venue.update',
      entityType: 'venue',
      entityId: id,
      before: before as unknown as Record<string, unknown>,
      after: venue as unknown as Record<string, unknown>,
    });
    return venue;
  }

  async delete(actorId: string, id: string) {
    const before = await this.getById(id);
    await this.pool.query('DELETE FROM venues WHERE id = $1', [id]);
    await writeAudit(this.pool, {
      actorId,
      action: 'venue.delete',
      entityType: 'venue',
      entityId: id,
      before: before as unknown as Record<string, unknown>,
    });
  }

  listSlots(venueId: string, date: string) {
    return this.slots.listByVenueAndDate(venueId, date);
  }

  async listAllSlots(query: {
    venueId?: string;
    date?: string;
    status?: string;
    limit: number;
  }) {
    const params: unknown[] = [];
    let where = 'WHERE 1=1';
    if (query.venueId) {
      params.push(query.venueId);
      where += ` AND venue_id = $${params.length}`;
    }
    if (query.date) {
      params.push(query.date);
      where += ` AND start_time >= $${params.length}::date AND start_time < ($${params.length}::date + INTERVAL '1 day')`;
    }
    if (query.status) {
      params.push(query.status);
      where += ` AND status = $${params.length}`;
    }
    params.push(query.limit);
    const result = await this.pool.query(
      `SELECT * FROM time_slots ${where} ORDER BY start_time LIMIT $${params.length}`,
      params
    );
    return result.rows.map(mapSlot);
  }

  async createSlots(actorId: string, venueId: string, input: CreateSlotsInput) {
    const created = await this.slots.createBulk(venueId, input);
    await writeAudit(this.pool, {
      actorId,
      action: 'slot.bulk_create',
      entityType: 'venue',
      entityId: venueId,
      after: { count: created.length },
    });
    return created;
  }

  async generateSlots(actorId: string, venueId: string, input: AdminGenerateSlotsInput) {
    const venue = await this.getById(venueId);
    const capacity = input.maxCapacity ?? venue.capacity;
    const slots: CreateSlotsInput['slots'] = [];

    const start = new Date(input.startDate);
    const end = new Date(input.endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      for (let hour = input.startHour; hour < input.endHour; hour++) {
        const slotStart = new Date(d);
        slotStart.setHours(hour, 0, 0, 0);
        const slotEnd = new Date(slotStart);
        slotEnd.setHours(hour + 1, 0, 0, 0);
        slots.push({
          startTime: slotStart.toISOString(),
          endTime: slotEnd.toISOString(),
          maxCapacity: capacity,
        });
      }
    }
    return this.createSlots(actorId, venueId, { slots });
  }

  async getSlot(id: string) {
    const result = await this.pool.query('SELECT * FROM time_slots WHERE id = $1', [id]);
    if (!result.rows[0]) throw new AppError('NOT_FOUND', 'Slot not found', 404);
    return mapSlot(result.rows[0]);
  }

  async updateSlot(actorId: string, id: string, input: AdminUpdateSlotInput) {
    const before = await this.getSlot(id);
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (input.startTime !== undefined) {
      fields.push(`start_time = $${idx++}`);
      values.push(input.startTime);
    }
    if (input.endTime !== undefined) {
      fields.push(`end_time = $${idx++}`);
      values.push(input.endTime);
    }
    if (input.maxCapacity !== undefined) {
      fields.push(`max_capacity = $${idx++}`);
      values.push(input.maxCapacity);
    }
    if (input.status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(input.status);
    }
    if (input.bookedCount !== undefined) {
      fields.push(`booked_count = $${idx++}`);
      values.push(input.bookedCount);
    }

    if (fields.length === 0) return before;

    values.push(id);
    const result = await this.pool.query(
      `UPDATE time_slots SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    const slot = mapSlot(result.rows[0]);
    await writeAudit(this.pool, {
      actorId,
      action: 'slot.update',
      entityType: 'slot',
      entityId: id,
      before: before as unknown as Record<string, unknown>,
      after: slot as unknown as Record<string, unknown>,
    });
    return slot;
  }

  async deleteSlot(actorId: string, id: string) {
    const before = await this.getSlot(id);
    const bookings = await this.pool.query(
      `SELECT id FROM bookings WHERE time_slot_id = $1 AND status = 'confirmed'`,
      [id]
    );
    if (bookings.rows.length > 0) {
      throw new AppError('CONFLICT', 'Cannot delete slot with active bookings', 409);
    }
    await this.pool.query('DELETE FROM time_slots WHERE id = $1', [id]);
    await writeAudit(this.pool, {
      actorId,
      action: 'slot.delete',
      entityType: 'slot',
      entityId: id,
      before: before as unknown as Record<string, unknown>,
    });
  }

  async unlockSlot(actorId: string, id: string) {
    await releaseSlotLock(this.pool, this.redis, id);
    const slot = await this.updateSlot(actorId, id, { status: 'available' });
    return slot;
  }

  async recountSlot(actorId: string, id: string) {
    const countResult = await this.pool.query(
      `SELECT COUNT(*)::int AS c FROM bookings WHERE time_slot_id = $1 AND status = 'confirmed'`,
      [id]
    );
    const slot = await this.getSlot(id);
    const count = countResult.rows[0].c;
    const status = count >= slot.maxCapacity ? 'full' : 'available';
    return this.updateSlot(actorId, id, { bookedCount: count, status });
  }

  async listVenueAdmins(venueId: string) {
    const result = await this.pool.query(
      `SELECT u.id, u.email, u.username, u.role, va.created_at
       FROM venue_admins va JOIN users u ON u.id = va.user_id
       WHERE va.venue_id = $1`,
      [venueId]
    );
    return result.rows.map((r) => ({
      userId: r.id,
      email: r.email,
      username: r.username,
      role: r.role,
      assignedAt: r.created_at.toISOString(),
    }));
  }

  async assignVenueAdmin(actorId: string, venueId: string, input: AdminAssignVenueAdminInput) {
    await this.getById(venueId);
    await this.pool.query(
      `INSERT INTO venue_admins (user_id, venue_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [input.userId, venueId]
    );
    await this.pool.query(`UPDATE users SET role = 'venue_admin' WHERE id = $1 AND role = 'player'`, [
      input.userId,
    ]);
    await writeAudit(this.pool, {
      actorId,
      action: 'venue.assign_admin',
      entityType: 'venue',
      entityId: venueId,
      after: { userId: input.userId },
    });
  }

  async removeVenueAdmin(actorId: string, venueId: string, userId: string) {
    await this.pool.query(`DELETE FROM venue_admins WHERE venue_id = $1 AND user_id = $2`, [
      venueId,
      userId,
    ]);
    await writeAudit(this.pool, {
      actorId,
      action: 'venue.remove_admin',
      entityType: 'venue',
      entityId: venueId,
      before: { userId },
    });
  }
}
