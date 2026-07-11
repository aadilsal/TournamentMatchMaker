import { randomInt } from 'crypto';
import type { Pool } from 'pg';
import type { RedisClient } from '../../lib/redis.js';
import type { Env } from '../../config/env.js';
import { AppError } from '../../lib/response.js';

const LINK_CODE_TTL_SECONDS = 10 * 60; // 10 minutes

const codeKey = (code: string) => `meta:link-code:${code}`;

function generateCode(): string {
  // 4-digit, zero-padded
  return String(randomInt(0, 10000)).padStart(4, '0');
}

export interface GenerateCodeResult {
  code: string;
  expiresInSeconds: number;
}

export interface VerifyCodeResult {
  userId: string;
  username: string;
}

export class MetaLinkService {
  constructor(
    private pool: Pool,
    private redis: RedisClient,
    private env: Env
  ) {}

  async generateLinkCode(userId: string): Promise<GenerateCodeResult> {
    const userResult = await this.pool.query(
      `SELECT id, username FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    const user = userResult.rows[0];
    if (!user) {
      throw new AppError('NOT_FOUND', 'User not found', 404);
    }

    // Try to generate a unique code (up to 10 attempts to avoid collisions)
    let code = '';
    let success = false;
    for (let i = 0; i < 10; i++) {
      code = generateCode();
      const key = codeKey(code);
      // NX ensures we only set if it doesn't exist
      const set = await this.redis.set(
        key,
        JSON.stringify({ userId: user.id, username: user.username }),
        'EX',
        LINK_CODE_TTL_SECONDS,
        'NX'
      );
      if (set) {
        success = true;
        break;
      }
    }

    if (!success) {
      throw new AppError('SERVER_ERROR', 'Failed to generate a unique link code', 500);
    }

    return {
      code,
      expiresInSeconds: LINK_CODE_TTL_SECONDS,
    };
  }

  async verifyLinkCode(code: string): Promise<VerifyCodeResult> {
    const key = codeKey(code);
    const recordStr = await this.redis.get(key);

    if (!recordStr) {
      throw new AppError(
        'CODE_INVALID',
        'This code has expired or is invalid. Please generate a new one from your profile.',
        400
      );
    }

    const record = JSON.parse(recordStr) as VerifyCodeResult;

    // Code is single-use, so delete it after successful verification
    await this.redis.del(key);

    return record;
  }
}
