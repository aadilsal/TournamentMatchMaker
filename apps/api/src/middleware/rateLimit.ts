import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { Env } from '../config/env.js';
import { getRedis } from '../lib/redis.js';
import { sendError } from '../lib/response.js';

const WINDOW_SECONDS = 60;

interface LimiterOptions {
  /** Bucket name — keeps unrelated activity on separate budgets. */
  bucket: string;
  max: number;
  windowSeconds?: number;
  key: (req: Request) => string;
  /** Return true to let the request through without consuming budget. */
  skip?: (req: Request) => boolean;
}

function createRateLimiter(env: Env, options: LimiterOptions) {
  const windowSeconds = options.windowSeconds ?? WINDOW_SECONDS;

  return async (req: Request, res: Response, next: NextFunction) => {
    if (env.NODE_ENV === 'test') {
      return next();
    }
    if (options.skip?.(req)) {
      return next();
    }
    try {
      const redis = getRedis(env.REDIS_URL);
      const key = `ratelimit:${options.bucket}:${options.key(req)}`;
      const count = await redis.incr(key);

      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }

      if (count > options.max) {
        const ttl = await redis.ttl(key);
        res.setHeader('Retry-After', String(ttl > 0 ? ttl : windowSeconds));
        return sendError(
          res,
          { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' },
          429
        );
      }

      next();
    } catch {
      next();
    }
  };
}

/**
 * Identify the caller without paying for full authentication — the public
 * limiter runs before `authenticate`, and an unverified `sub` is good enough to
 * pick a bucket (a forged token only ever rate-limits its own bucket).
 */
function identifyUser(req: Request, env: Env): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  try {
    const payload = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET) as { sub?: string };
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

function isRead(req: Request): boolean {
  return req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';
}

/**
 * Anonymous traffic only. Signed-in users are metered by `scopedRateLimit`
 * instead: a single logged-in player polling matches, queue status, bookings and
 * notifications legitimately exceeds any per-IP browse budget, and several
 * players behind one office/venue NAT share that IP.
 */
export function publicRateLimit(env: Env) {
  const max = env.NODE_ENV === 'development' ? 1000 : 120;
  return createRateLimiter(env, {
    bucket: 'public',
    max,
    key: (req) => req.ip ?? 'unknown',
    skip: (req) => identifyUser(req, env) !== null,
  });
}

/**
 * Per-user, per-feature budget. Buckets are deliberately separate so that a
 * player doing several things at once — polling their matches, booking a slot
 * and searching for an opponent — never spends one feature's budget on another.
 * Reads get a much larger allowance than writes because the UI polls them.
 */
export function scopedRateLimit(
  env: Env,
  bucket: string,
  limits: { read?: number; write?: number } = {}
) {
  const readMax = limits.read ?? 300;
  const writeMax = limits.write ?? 60;
  const devMultiplier = env.NODE_ENV === 'development' ? 5 : 1;

  const readLimiter = createRateLimiter(env, {
    bucket: `${bucket}:r`,
    max: readMax * devMultiplier,
    key: (req) => req.user?.sub ?? identifyUser(req, env) ?? req.ip ?? 'unknown',
  });
  const writeLimiter = createRateLimiter(env, {
    bucket: `${bucket}:w`,
    max: writeMax * devMultiplier,
    key: (req) => req.user?.sub ?? identifyUser(req, env) ?? req.ip ?? 'unknown',
  });

  return (req: Request, res: Response, next: NextFunction) =>
    isRead(req) ? readLimiter(req, res, next) : writeLimiter(req, res, next);
}

/**
 * Credential-stuffing defence for the unauthenticated auth endpoints.
 *
 * Two independent budgets, because either one alone is bypassable:
 *  - per IP, so one host cannot walk a password list;
 *  - per email, so a botnet spread across many IPs cannot walk one account.
 *
 * Only failed attempts are expensive, but counting every attempt is simpler and
 * the limits sit far above what a real person does (a human logging in a few
 * times a minute never gets close).
 */
export function credentialRateLimit(env: Env) {
  // No development multiplier here, unlike the feature buckets: a brute-force
  // control that behaves differently outside production cannot be verified
  // before it ships. (`NODE_ENV === 'test'` still bypasses every limiter.)

  // Deliberately loose: a venue runs every player through one NAT address on a
  // tournament day, so this only has to stop a password spray across many
  // accounts. The per-account budget below is the tight one.
  const perIp = createRateLimiter(env, {
    bucket: 'auth:ip',
    max: 50,
    windowSeconds: 300,
    key: (req) => req.ip ?? 'unknown',
  });

  const perAccount = createRateLimiter(env, {
    bucket: 'auth:account',
    max: 10,
    windowSeconds: 900,
    key: (req) => String((req.body as { email?: string } | undefined)?.email ?? '').toLowerCase(),
    skip: (req) => !(req.body as { email?: string } | undefined)?.email,
  });

  return (req: Request, res: Response, next: NextFunction) =>
    perIp(req, res, (err?: unknown) => (err ? next(err) : perAccount(req, res, next)));
}

/**
 * Meta/VR headset traffic is keyed by player, not by IP: a venue runs several
 * Quest headsets behind one public IP, and each polls GET /matches/current every
 * 2–5s (up to 30 req/min per player). A per-IP bucket would 429 them within
 * seconds of the second headset connecting.
 */
export function metaPollRateLimit(env: Env) {
  return createRateLimiter(env, {
    bucket: 'meta',
    max: 240,
    key: (req) => {
      const userId =
        (req.query?.userId as string | undefined) ??
        (req.body as { userId?: string } | undefined)?.userId;
      return userId ?? req.ip ?? 'unknown';
    },
  });
}

/**
 * Link codes are only 4 digits with a 10-minute TTL, so the verify endpoint stays
 * on a tight per-IP bucket to keep the keyspace impractical to sweep.
 */
export function metaVerifyRateLimit(env: Env) {
  return createRateLimiter(env, {
    bucket: 'meta-verify',
    max: 10,
    key: (req) => req.ip ?? 'unknown',
  });
}
