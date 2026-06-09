import type { Pool } from 'pg';
import type { UpdatePlayerInput } from '@vr-tournament/shared';
import { mapUser } from '../../lib/mappers.js';
import { AppError } from '../../lib/response.js';

export class PlayersService {
  constructor(private pool: Pool) {}

  async getProfile(userId: string) {
    const result = await this.pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (!result.rows[0]) {
      throw new AppError('NOT_FOUND', 'User not found', 404);
    }
    return mapUser(result.rows[0]);
  }

  async updateProfile(userId: string, input: UpdatePlayerInput) {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const mapping: Record<string, unknown> = {
      username: input.username,
      country: input.country,
      city: input.city,
      has_vr_headset: input.hasVrHeadset,
      vr_device_type: input.vrDeviceType,
      skill_tier: input.skillTier,
    };

    for (const [col, val] of Object.entries(mapping)) {
      if (val !== undefined) {
        fields.push(`${col} = $${idx++}`);
        values.push(val);
      }
    }

    if (fields.length === 0) {
      return this.getProfile(userId);
    }

    fields.push(`updated_at = NOW()`);
    values.push(userId);

    try {
      const result = await this.pool.query(
        `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
        values
      );
      return mapUser(result.rows[0]);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
        throw new AppError('CONFLICT', 'Username already taken', 409);
      }
      throw err;
    }
  }
}
