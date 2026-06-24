import bcrypt from 'bcryptjs';
import type { Pool } from 'pg';
import type {
  AdminCreateUserInput,
  AdminListQuery,
  AdminResetPasswordInput,
  AdminUpdateUserInput,
} from '@vr-tournament/shared';
import { DEFAULT_RATING_POINTS, pointsToTier } from '@vr-tournament/shared';
import { mapUser } from '../../../lib/mappers.js';
import { AppError } from '../../../lib/response.js';
import { writeAudit } from '../../../lib/audit.js';

const BCRYPT_ROUNDS = 12;

export class AdminUsersService {
  constructor(private pool: Pool) {}

  async list(query: AdminListQuery & { role?: string }) {
    const params: unknown[] = [];
    let where = 'WHERE 1=1';

    if (query.search) {
      params.push(`%${query.search}%`);
      where += ` AND (email ILIKE $${params.length} OR username ILIKE $${params.length})`;
    }
    if (query.role) {
      params.push(query.role);
      where += ` AND role = $${params.length}`;
    }
    if (query.cursor) {
      params.push(query.cursor);
      where += ` AND id < $${params.length}`;
    }

    params.push(query.limit + 1);
    const limitIdx = params.length;

    const result = await this.pool.query(
      `SELECT * FROM users ${where} ORDER BY created_at DESC, id DESC LIMIT $${limitIdx}`,
      params
    );

    const rows = result.rows;
    const hasMore = rows.length > query.limit;
    const items = (hasMore ? rows.slice(0, query.limit) : rows).map(mapUser);

    return { items, nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null };
  }

  async getById(id: string) {
    const result = await this.pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (!result.rows[0]) throw new AppError('NOT_FOUND', 'User not found', 404);
    return mapUser(result.rows[0]);
  }

  async getDetail(id: string) {
    const user = await this.getById(id);

    const [matches, tournaments, bookings] = await Promise.all([
      this.pool.query(
        `SELECT COUNT(*)::int AS c FROM matches
         WHERE player1_id = $1 OR player2_id = $1`,
        [id]
      ),
      this.pool.query(
        `SELECT t.id, t.name, tp.status, tp.wins, tp.losses
         FROM tournament_participants tp
         JOIN tournaments t ON t.id = tp.tournament_id
         WHERE tp.user_id = $1 ORDER BY t.start_date DESC`,
        [id]
      ),
      this.pool.query(
        `SELECT COUNT(*)::int AS c FROM bookings WHERE user_id = $1 AND status = 'confirmed'`,
        [id]
      ),
    ]);

    const suspended = await this.pool.query(
      `SELECT suspended_at FROM users WHERE id = $1`,
      [id]
    );

    return {
      ...user,
      suspendedAt: suspended.rows[0]?.suspended_at?.toISOString() ?? null,
      totalMatches: matches.rows[0].c,
      confirmedBookings: bookings.rows[0].c,
      tournaments: tournaments.rows.map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        wins: r.wins,
        losses: r.losses,
      })),
    };
  }

  async syncTier(actorId: string, id: string) {
    const user = await this.getById(id);
    const tier = pointsToTier(user.ratingPoints ?? DEFAULT_RATING_POINTS);
    await this.pool.query(
      `UPDATE users SET skill_tier = $1, updated_at = NOW() WHERE id = $2`,
      [tier, id]
    );
    await writeAudit(this.pool, {
      actorId,
      action: 'user.sync_tier',
      entityType: 'user',
      entityId: id,
      after: { tier },
    });
    return this.getDetail(id);
  }

  async create(actorId: string, input: AdminCreateUserInput) {
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const rating = input.ratingPoints ?? DEFAULT_RATING_POINTS;
    const tier = input.skillTier ?? pointsToTier(rating);

    try {
      const result = await this.pool.query(
        `INSERT INTO users (email, password_hash, username, country, city, has_vr_headset, vr_device_type,
          latitude, longitude, rating_points, skill_tier, role)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [
          input.email,
          passwordHash,
          input.username,
          input.country ?? null,
          input.city ?? null,
          input.hasVrHeadset ?? false,
          input.vrDeviceType ?? null,
          input.latitude ?? null,
          input.longitude ?? null,
          rating,
          tier,
          input.role ?? 'player',
        ]
      );
      const user = mapUser(result.rows[0]);
      await writeAudit(this.pool, {
        actorId,
        action: 'user.create',
        entityType: 'user',
        entityId: user.id,
        after: user as unknown as Record<string, unknown>,
      });
      return user;
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
        throw new AppError('CONFLICT', 'Email or username already taken', 409);
      }
      throw err;
    }
  }

  async update(actorId: string, id: string, input: AdminUpdateUserInput) {
    const before = await this.getById(id);
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const setField = (col: string, val: unknown) => {
      fields.push(`${col} = $${idx++}`);
      values.push(val);
    };

    if (input.email !== undefined) setField('email', input.email);
    if (input.username !== undefined) setField('username', input.username);
    if (input.country !== undefined) setField('country', input.country);
    if (input.city !== undefined) setField('city', input.city);
    if (input.hasVrHeadset !== undefined) setField('has_vr_headset', input.hasVrHeadset);
    if (input.vrDeviceType !== undefined) setField('vr_device_type', input.vrDeviceType);
    if (input.latitude !== undefined) setField('latitude', input.latitude);
    if (input.longitude !== undefined) setField('longitude', input.longitude);
    if (input.role !== undefined) setField('role', input.role);
    if (input.ratingPoints !== undefined) {
      setField('rating_points', input.ratingPoints);
      if (input.skillTier === undefined) {
        setField('skill_tier', pointsToTier(input.ratingPoints));
      }
    }
    if (input.skillTier !== undefined) setField('skill_tier', input.skillTier);
    if (input.suspended !== undefined) {
      setField('suspended_at', input.suspended ? new Date() : null);
    }

    if (fields.length === 0) return before;

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await this.pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    const user = mapUser(result.rows[0]);
    await writeAudit(this.pool, {
      actorId,
      action: 'user.update',
      entityType: 'user',
      entityId: id,
      before: before as unknown as Record<string, unknown>,
      after: user as unknown as Record<string, unknown>,
    });
    return user;
  }

  async delete(actorId: string, id: string) {
    const before = await this.getById(id);
    await this.pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [id]);
    await this.pool.query('DELETE FROM users WHERE id = $1', [id]);
    await writeAudit(this.pool, {
      actorId,
      action: 'user.delete',
      entityType: 'user',
      entityId: id,
      before: before as unknown as Record<string, unknown>,
    });
  }

  async resetPassword(actorId: string, id: string, input: AdminResetPasswordInput) {
    const hash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    await this.pool.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [hash, id]
    );
    await this.pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [id]);
    await writeAudit(this.pool, {
      actorId,
      action: 'user.reset_password',
      entityType: 'user',
      entityId: id,
    });
  }

  async revokeSessions(actorId: string, id: string) {
    await this.getById(id);
    await this.pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [id]);
    await writeAudit(this.pool, {
      actorId,
      action: 'user.revoke_sessions',
      entityType: 'user',
      entityId: id,
    });
  }
}
