import { createHash, randomInt, timingSafeEqual } from 'crypto';
import type { Pool } from 'pg';
import type { RedisClient } from '../../lib/redis.js';
import type { Env } from '../../config/env.js';
import { AppError } from '../../lib/response.js';
import { sendEmail } from '../../lib/mailer.js';
import { metaOtpEmailHtml } from './meta-otp.email.js';

const OTP_TTL_SECONDS = 5 * 60; // 5 minutes
const RESEND_COOLDOWN_SECONDS = 60; // min gap between (re)sends for one email
const MAX_SENDS = 5; // initial send + up to 4 resends within a session
const MAX_VERIFY_ATTEMPTS = 5; // wrong-code attempts before the code is burned

const otpKey = (email: string) => `meta:otp:${email}`;
const cooldownKey = (email: string) => `meta:otp:cooldown:${email}`;

function hashOtp(otp: string, email: string): string {
  return createHash('sha256').update(`${otp}:${email}`).digest('hex');
}

function generateOtp(): string {
  // 6-digit, zero-padded, cryptographically random
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export interface RequestOtpResult {
  email: string;
  sent: boolean;
  expiresInSeconds: number;
  resendAvailableInSeconds: number;
  resendsRemaining: number;
}

export interface VerifyOtpResult {
  verified: true;
  userId: string;
  username: string;
  email: string;
}

export class MetaOtpService {
  constructor(
    private pool: Pool,
    private redis: RedisClient,
    private env: Env
  ) {}

  async requestOtp(email: string): Promise<RequestOtpResult> {
    // Enforce resend cooldown first so we don't spam a mailbox.
    const cooldownTtl = await this.redis.ttl(cooldownKey(email));
    if (cooldownTtl > 0) {
      throw new AppError(
        'RATE_LIMITED',
        `Please wait ${cooldownTtl}s before requesting another code`,
        429,
        { retryAfterSeconds: cooldownTtl }
      );
    }

    const userResult = await this.pool.query(
      `SELECT id, username FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email]
    );
    const user = userResult.rows[0];
    if (!user) {
      throw new AppError('NOT_FOUND', 'No Pixel Paddle account found for this email', 404);
    }

    const existing = await this.redis.hgetall(otpKey(email));
    const priorSends = Number(existing.sends ?? 0);
    if (priorSends >= MAX_SENDS) {
      throw new AppError(
        'RATE_LIMITED',
        'Maximum number of codes requested. Please try again in a few minutes.',
        429,
        { retryAfterSeconds: OTP_TTL_SECONDS }
      );
    }

    const otp = generateOtp();
    const sends = priorSends + 1;

    await this.redis.hset(otpKey(email), {
      otpHash: hashOtp(otp, email),
      userId: user.id,
      username: user.username,
      attempts: '0',
      sends: String(sends),
    });
    await this.redis.expire(otpKey(email), OTP_TTL_SECONDS);
    await this.redis.set(cooldownKey(email), '1', 'EX', RESEND_COOLDOWN_SECONDS);

    await sendEmail(
      this.env,
      email,
      'Your Pixel Paddle verification code',
      metaOtpEmailHtml({ username: user.username, otp, expiresInMinutes: OTP_TTL_SECONDS / 60 })
    );

    return {
      email,
      sent: true,
      expiresInSeconds: OTP_TTL_SECONDS,
      resendAvailableInSeconds: RESEND_COOLDOWN_SECONDS,
      resendsRemaining: Math.max(0, MAX_SENDS - sends),
    };
  }

  async verifyOtp(email: string, otp: string): Promise<VerifyOtpResult> {
    const key = otpKey(email);
    const record = await this.redis.hgetall(key);

    if (!record || !record.otpHash) {
      throw new AppError(
        'OTP_EXPIRED',
        'This code has expired or was never requested. Please request a new one.',
        410
      );
    }

    const attempts = Number(record.attempts ?? 0);
    if (attempts >= MAX_VERIFY_ATTEMPTS) {
      await this.redis.del(key, cooldownKey(email));
      throw new AppError(
        'TOO_MANY_ATTEMPTS',
        'Too many incorrect attempts. Please request a new code.',
        429
      );
    }

    const expected = Buffer.from(record.otpHash, 'hex');
    const provided = Buffer.from(hashOtp(otp, email), 'hex');
    const matches = expected.length === provided.length && timingSafeEqual(expected, provided);

    if (!matches) {
      const newAttempts = await this.redis.hincrby(key, 'attempts', 1);
      const attemptsRemaining = Math.max(0, MAX_VERIFY_ATTEMPTS - newAttempts);
      if (attemptsRemaining === 0) {
        await this.redis.del(key, cooldownKey(email));
      }
      throw new AppError('OTP_INVALID', 'Incorrect verification code', 400, { attemptsRemaining });
    }

    await this.redis.del(key, cooldownKey(email));

    return {
      verified: true,
      userId: record.userId as string,
      username: record.username as string,
      email,
    };
  }
}
