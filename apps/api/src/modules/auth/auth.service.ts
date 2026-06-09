import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'crypto';
import type { Pool } from 'pg';
import type { RedisClient } from '../../lib/redis.js';
import type { RegisterInput, UserRole } from '@vr-tournament/shared';
import type { Env } from '../../config/env.js';
import type { AuthPayload } from '../../middleware/auth.js';
import { mapUser } from '../../lib/mappers.js';
import { AppError } from '../../lib/response.js';

const BCRYPT_ROUNDS = 12;
const REFRESH_COOKIE = 'refresh_token';

export class AuthService {
  constructor(
    private pool: Pool,
    private redis: RedisClient,
    private env: Env
  ) {}

  async register(input: RegisterInput) {
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    try {
      const result = await this.pool.query(
        `INSERT INTO users (email, password_hash, username, country, city, has_vr_headset, vr_device_type, latitude, longitude)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
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
        ]
      );

      const user = mapUser(result.rows[0]);
      const tokens = await this.issueTokens(user.id, user.email, user.role as UserRole);
      return { user, ...tokens };
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
        throw new AppError('CONFLICT', 'Email or username already exists', 409);
      }
      throw err;
    }
  }

  async login(email: string, password: string) {
    const result = await this.pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const row = result.rows[0];

    if (!row) {
      throw new AppError('UNAUTHORIZED', 'Invalid email or password', 401);
    }

    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) {
      throw new AppError('UNAUTHORIZED', 'Invalid email or password', 401);
    }

    const user = mapUser(row);
    const tokens = await this.issueTokens(user.id, user.email, user.role as UserRole);
    return { user, ...tokens };
  }

  async refresh(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    const result = await this.pool.query(
      `SELECT rt.*, u.* FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1 AND rt.expires_at > NOW()`,
      [tokenHash]
    );

    const row = result.rows[0];
    if (!row) {
      throw new AppError('UNAUTHORIZED', 'Invalid or expired refresh token', 401);
    }

    await this.pool.query('DELETE FROM refresh_tokens WHERE id = $1', [row.id]);

    const user = mapUser(row);
    const tokens = await this.issueTokens(user.id, user.email, user.role as UserRole);
    return { user, ...tokens };
  }

  async logout(userId: string, jti?: string, tokenExp?: number) {
    await this.pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);

    if (jti && tokenExp) {
      const ttl = tokenExp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await this.redis.setex(`jwt:blacklist:${jti}`, ttl, '1');
      }
    }
  }

  private async issueTokens(userId: string, email: string, role: UserRole) {
    const jti = randomBytes(16).toString('hex');
    const accessToken = jwt.sign(
      { sub: userId, email, role, jti } satisfies AuthPayload,
      this.env.JWT_ACCESS_SECRET,
      { expiresIn: this.env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
    );

    const refreshToken = randomBytes(32).toString('hex');
    const refreshHash = this.hashToken(refreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.pool.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [userId, refreshHash, expiresAt.toISOString()]
    );

    return { accessToken, refreshToken, refreshCookieName: REFRESH_COOKIE };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  getRefreshCookieOptions() {
    return {
      httpOnly: true,
      secure: this.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/v1/auth',
    };
  }
}
