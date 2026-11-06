import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'crypto';
import type { Pool } from 'pg';
import type { RedisClient } from '../../lib/redis.js';
import type { RegisterInput, UserRole } from '@vr-tournament/shared';
import { DEFAULT_RATING_POINTS, pointsToTier } from '@vr-tournament/shared';
import type { Env } from '../../config/env.js';
import type { AuthPayload } from '../../middleware/auth.js';
import { mapUser } from '../../lib/mappers.js';
import { AppError } from '../../lib/response.js';
import { sendEmail } from '../../lib/mailer.js';
import { revokeUserTokens } from '../../lib/token-revocation.js';
import { disconnectUser } from '../../socket/emitters.js';

const BCRYPT_ROUNDS = 12;
const REFRESH_COOKIE = 'refresh_token';
// Compared against when there is no real hash, so unknown emails cost the same bcrypt time.
const DUMMY_HASH = '$2b$12$jkptTrveB6DWy/7LIKG3dOdOdELxTVq1/9vjG76ifkdpBOngaIxXO';
const INVALID_RESET = 'This reset link is invalid or has expired';

const normaliseEmail = (email: string) => email.trim().toLowerCase();

const SUSPENDED_MESSAGE = 'This account is suspended — contact an administrator';

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
        `INSERT INTO users (email, password_hash, username, country, city, has_vr_headset, vr_device_type, latitude, longitude, rating_points, skill_tier)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          // Stored folded: `checkAvailability` and the unique indexes compare
          // case-insensitively, so writing the raw casing here let the same
          // address register twice ("A@x.com" alongside "a@x.com").
          normaliseEmail(input.email),
          passwordHash,
          input.username,
          input.country ?? null,
          input.city ?? null,
          input.hasVrHeadset ?? false,
          input.vrDeviceType ?? null,
          input.latitude ?? null,
          input.longitude ?? null,
          DEFAULT_RATING_POINTS,
          pointsToTier(DEFAULT_RATING_POINTS),
        ]
      );

      const user = mapUser(result.rows[0]);
      const tokens = await this.issueTokens(user.id, user.email, user.role as UserRole);
      return { user, ...tokens };
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
        const detail = 'detail' in err ? String(err.detail ?? '') : '';
        const constraint = 'constraint' in err ? String(err.constraint ?? '') : '';

        if (detail.includes('(email)') || constraint.includes('email')) {
          throw new AppError('CONFLICT', 'This email is already registered', 409, { field: 'email' });
        }
        if (detail.includes('(username)') || constraint.includes('username')) {
          throw new AppError('CONFLICT', 'This username is taken', 409, { field: 'username' });
        }

        throw new AppError('CONFLICT', 'Email or username already exists', 409);
      }
      throw err;
    }
  }

  async checkAvailability(params: { email?: string; username?: string }) {
    const result: { emailTaken?: boolean; usernameTaken?: boolean } = {};

    if (params.email) {
      const emailResult = await this.pool.query(
        'SELECT 1 FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
        [params.email.trim()]
      );
      result.emailTaken = (emailResult.rowCount ?? 0) > 0;
    }

    if (params.username) {
      const usernameResult = await this.pool.query(
        'SELECT 1 FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1',
        [params.username.trim()]
      );
      result.usernameTaken = (usernameResult.rowCount ?? 0) > 0;
    }

    return result;
  }

  async login(email: string, password: string) {
    const result = await this.pool.query('SELECT * FROM users WHERE LOWER(email) = $1', [
      normaliseEmail(email),
    ]);
    const row = result.rows[0];

    if (!row) {
      await bcrypt.compare(password, DUMMY_HASH);
      throw new AppError('UNAUTHORIZED', 'Invalid email or password', 401);
    }

    // A bot is not an account. Its stored hash is not a bcrypt digest, so the
    // comparison below could never succeed anyway — this refuses before that,
    // so no future change to how bots are seeded can turn one into a way in.
    // Phrased as a bad credential like every other failure, giving away
    // nothing about which addresses exist.
    if (row.is_bot) {
      await bcrypt.compare(password, DUMMY_HASH);
      throw new AppError('UNAUTHORIZED', 'Invalid email or password', 401);
    }

    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) {
      throw new AppError('UNAUTHORIZED', 'Invalid email or password', 401);
    }

    // Checked after the password so a suspended account is not distinguishable
    // from a wrong password to someone guessing.
    if (row.suspended_at) {
      throw new AppError('FORBIDDEN', SUSPENDED_MESSAGE, 403);
    }

    const user = mapUser(row);
    const tokens = await this.issueTokens(user.id, user.email, user.role as UserRole);
    return { user, ...tokens };
  }

  async refresh(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    // Delete-and-return: rotating in a single statement means a replayed token
    // finds no row, so concurrent reuse can never mint a second pair.
    // `rt.id` must be aliased — `SELECT rt.*, u.*` lets u.id overwrite it, which
    // previously made this DELETE target the user id and match nothing.
    const result = await this.pool.query(
      `DELETE FROM refresh_tokens rt
       USING users u
       WHERE u.id = rt.user_id
         AND rt.token_hash = $1
         AND rt.expires_at > NOW()
       RETURNING u.*`,
      [tokenHash]
    );

    const row = result.rows[0];
    if (!row) {
      throw new AppError('UNAUTHORIZED', 'Invalid or expired refresh token', 401);
    }

    // A suspension landing mid-session must not be survivable by refreshing.
    if (row.suspended_at) {
      throw new AppError('FORBIDDEN', SUSPENDED_MESSAGE, 403);
    }

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

  /** Emails a single-use reset link; silently does nothing for unknown, bot or suspended accounts. */
  async requestPasswordReset(email: string) {
    const result = await this.pool.query(
      `SELECT id, email FROM users
       WHERE LOWER(email) = $1 AND NOT is_bot AND suspended_at IS NULL`,
      [normaliseEmail(email)]
    );
    const user = result.rows[0];
    if (!user) return;

    const token = randomBytes(32).toString('hex');
    await this.pool.query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
      [user.id, this.hashToken(token)]
    );

    const link = `${this.env.APP_URL}/reset-password?token=${token}`;
    await sendEmail(
      this.env,
      user.email,
      'Reset your password',
      `<p>Someone asked to reset the password for this account.</p>
       <p><a href="${link}">Choose a new password</a> — the link works once and expires in 1 hour.</p>
       <p>If this wasn't you, ignore this email; your password stays the same.</p>`
    );
  }

  async resetPassword(token: string, password: string) {
    const client = await this.pool.connect();
    let userId: string;
    try {
      await client.query('BEGIN');
      const claimed = await client.query(
        `UPDATE password_resets SET used_at = NOW()
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
         RETURNING user_id`,
        [this.hashToken(token)]
      );
      if (!claimed.rows[0]) {
        throw new AppError('INVALID_RESET_TOKEN', INVALID_RESET, 400);
      }
      userId = claimed.rows[0].user_id as string;

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      await client.query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [
        passwordHash,
        userId,
      ]);
      // Any other outstanding link for this account dies with this one.
      await client.query(`DELETE FROM password_resets WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [userId]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    await revokeUserTokens(this.redis, userId);
    disconnectUser(userId, 'Your password was changed — sign in again');
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
