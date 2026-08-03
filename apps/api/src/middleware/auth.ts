import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { UserRole } from '@vr-tournament/shared';
import type { Env } from '../config/env.js';
import { getRedis } from '../lib/redis.js';
import { AppError } from '../lib/response.js';
import { isTokenRevoked } from '../lib/token-revocation.js';

export interface AuthPayload {
  sub: string;
  email: string;
  role: UserRole;
  jti: string;
  /** Set by `jwt.sign`; used to test the token against the per-user revocation marker. */
  iat?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function authenticate(env: Env) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return next(new AppError('UNAUTHORIZED', 'Missing or invalid authorization header', 401));
    }

    const token = header.slice(7);
    try {
      const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthPayload;

      const redis = getRedis(env.REDIS_URL);
      const blacklisted = await redis.get(`jwt:blacklist:${payload.jti}`);
      if (blacklisted) {
        return next(new AppError('UNAUTHORIZED', 'Token has been revoked', 401));
      }

      // A role change, suspension or admin session revocation happens after the
      // token was minted, so the claims inside it are stale by then.
      if (await isTokenRevoked(redis, payload.sub, payload.iat)) {
        return next(new AppError('UNAUTHORIZED', 'Session is no longer valid — sign in again', 401));
      }

      req.user = payload;
      next();
    } catch {
      return next(new AppError('UNAUTHORIZED', 'Invalid or expired token', 401));
    }
  };
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('UNAUTHORIZED', 'Authentication required', 401));
    }
    if (!roles.includes(req.user.role)) {
      return next(new AppError('FORBIDDEN', 'Insufficient permissions', 403));
    }
    next();
  };
}
