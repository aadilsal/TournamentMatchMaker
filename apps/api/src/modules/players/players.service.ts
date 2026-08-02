import type { Pool } from 'pg';
import type { UpdatePlayerInput, UploadAvatarInput, BuybackOption } from '@vr-tournament/shared';
import { mapMatch, mapUser } from '../../lib/mappers.js';
import { AppError } from '../../lib/response.js';

const MATCH_SELECT = `
  SELECT m.*,
         u1.username AS p1_username, u1.skill_tier AS p1_skill_tier, u1.has_vr_headset AS p1_has_vr,
         u2.username AS p2_username, u2.skill_tier AS p2_skill_tier, u2.has_vr_headset AS p2_has_vr,
         v.name AS venue_name, v.city AS venue_city, v.address AS venue_address,
         ts.start_time AS slot_start, ts.end_time AS slot_end
  FROM matches m
  JOIN users u1 ON u1.id = m.player1_id
  JOIN users u2 ON u2.id = m.player2_id
  LEFT JOIN venues v ON v.id = m.venue_id
  LEFT JOIN time_slots ts ON ts.id = m.time_slot_id
`;

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

  async uploadAvatar(userId: string, input: UploadAvatarInput) {
    const buffer = Buffer.from(input.data, 'base64');
    if (buffer.length > 2 * 1024 * 1024) {
      throw new AppError('BAD_REQUEST', 'Image must be under 2MB', 400);
    }

    const result = await this.pool.query(
      `UPDATE users SET profile_picture = $1, profile_picture_mime = $2, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [buffer, input.mimeType, userId]
    );
    if (!result.rows[0]) {
      throw new AppError('NOT_FOUND', 'User not found', 404);
    }
    return mapUser(result.rows[0]);
  }

  async getAvatarBuffer(userId: string): Promise<{ buffer: Buffer; mime: string } | null> {
    const result = await this.pool.query(
      `SELECT profile_picture, profile_picture_mime FROM users WHERE id = $1`,
      [userId]
    );
    const row = result.rows[0];
    if (!row?.profile_picture) return null;
    return { buffer: row.profile_picture, mime: row.profile_picture_mime ?? 'image/jpeg' };
  }

  async getPublicByUsername(username: string) {
    const result = await this.pool.query(
      `SELECT u.*,
              COALESCE(stats.wins, 0)::int AS total_wins,
              COALESCE(stats.losses, 0)::int AS total_losses,
              COALESCE(stats.total, 0)::int AS total_matches
       FROM users u
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*) FILTER (WHERE (m.player1_id = u.id AND (m.result->>'winnerId')::uuid = u.id)
             OR (m.player2_id = u.id AND (m.result->>'winnerId')::uuid = u.id)) AS wins,
           COUNT(*) FILTER (WHERE m.status = 'completed'
             AND (m.result->>'winnerId') IS NOT NULL
             AND (m.result->>'winnerId')::uuid != u.id
             AND (m.player1_id = u.id OR m.player2_id = u.id)) AS losses,
           COUNT(*) FILTER (WHERE m.status = 'completed' AND (m.player1_id = u.id OR m.player2_id = u.id)) AS total
         FROM matches m
       ) stats ON true
       WHERE LOWER(u.username) = LOWER($1)`,
      [username]
    );
    const row = result.rows[0];
    if (!row) {
      throw new AppError('NOT_FOUND', 'Player not found', 404);
    }

    const user = mapUser(row);
    return {
      id: user.id,
      username: user.username,
      country: user.country,
      city: user.city,
      hasVrHeadset: user.hasVrHeadset,
      vrDeviceType: user.vrDeviceType,
      skillTier: user.skillTier,
      hasProfilePicture: user.hasProfilePicture ?? false,
      totalWins: row.total_wins,
      totalLosses: row.total_losses,
      totalMatches: row.total_matches,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async getPublicMatches(username: string, limit = 50) {
    const userResult = await this.pool.query(
      `SELECT id FROM users WHERE LOWER(username) = LOWER($1)`,
      [username]
    );
    const userId = userResult.rows[0]?.id;
    if (!userId) {
      throw new AppError('NOT_FOUND', 'Player not found', 404);
    }

    const result = await this.pool.query(
      `${MATCH_SELECT}
       WHERE m.player1_id = $1 OR m.player2_id = $1
       ORDER BY m.created_at DESC
       LIMIT $2`,
      [userId, limit]
    );
    return result.rows.map(mapMatch);
  }

  async resolveUserIdByUsername(username: string): Promise<string | null> {
    const result = await this.pool.query(
      `SELECT id FROM users WHERE LOWER(username) = LOWER($1)`,
      [username]
    );
    return result.rows[0]?.id ?? null;
  }

  async getBuybackOptions(userId: string): Promise<BuybackOption[]> {
    const result = await this.pool.query(
      `SELECT t.id AS tournament_id, t.name AS tournament_name, t.buyback_price_cents, tp.round_number
       FROM tournament_participants tp
       JOIN tournaments t ON t.id = tp.tournament_id
       JOIN tournament_rounds tr ON tr.tournament_id = t.id AND tr.round_number = tp.round_number
       WHERE tp.user_id = $1
         AND tp.status = 'eliminated'
         AND t.phase = 'normal'
         AND tr.status = 'active'
         AND tr.ends_at > NOW()
         AND (
           t.initial_player_count IS NULL
           OR (
             SELECT COUNT(*)::int FROM tournament_participants ap
             WHERE ap.tournament_id = t.id AND ap.status IN ('active', 'advanced')
           ) > FLOOR(t.initial_player_count::numeric / 2)
         )
       ORDER BY t.name ASC`,
      [userId]
    );

    return result.rows.map((row) => ({
      tournamentId: row.tournament_id,
      tournamentName: row.tournament_name,
      buybackPriceCents: row.buyback_price_cents,
      roundNumber: row.round_number,
    }));
  }
}
