import type { Request, Response, NextFunction } from 'express';
import type { Env } from '../config/env.js';
import { getRedis } from '../lib/redis.js';
import { sendError } from '../lib/response.js';

const WINDOW_SECONDS = 60;

export function createRateLimiter(env: Env, maxRequests: number, keyFn: (req: Request) => string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (env.NODE_ENV === 'test') {
      return next();
    }
    try {
      const redis = getRedis(env.REDIS_URL);
      const key = `ratelimit:${keyFn(req)}`;
      const count = await redis.incr(key);

      if (count === 1) {
        await redis.expire(key, WINDOW_SECONDS);
      }

      if (count > maxRequests) {
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

export function publicRateLimit(env: Env) {
  return createRateLimiter(env, 20, (req) => `public:${req.ip}`);
}

export function authRateLimit(env: Env) {
  return createRateLimiter(env, 100, (req) => `user:${req.user?.sub ?? req.ip}`);
}
