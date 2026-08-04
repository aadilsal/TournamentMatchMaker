import jwt from 'jsonwebtoken';
import type { Socket } from 'socket.io';
import type { Env } from '../config/env.js';
import type { AuthPayload } from '../middleware/auth.js';
import { getRedis } from '../lib/redis.js';
import { isTokenRevoked } from '../lib/token-revocation.js';

/**
 * A socket authenticates once and then lives for hours, so verifying the token
 * only at connect time let a logged-out, demoted or suspended session keep its
 * live feed — and keep acting on it, since the client emits `match:confirmed`
 * over that same connection. REST already refuses those tokens; this brings the
 * socket in line, both on connect and on every inbound event.
 */
export async function isSessionValid(env: Env, payload: AuthPayload): Promise<boolean> {
  if (isTokenExpired(payload)) return false;
  try {
    const redis = getRedis(env.REDIS_URL);
    if (await redis.get(`jwt:blacklist:${payload.jti}`)) return false;
    if (await isTokenRevoked(redis, payload.sub, payload.iat)) return false;
    return true;
  } catch {
    // Redis unreachable: fall back to the token's own signature and expiry
    // rather than dropping every live connection.
    return true;
  }
}

/** An access token that expired while its socket stayed open. */
export function isTokenExpired(payload: AuthPayload): boolean {
  const exp = (payload as { exp?: number }).exp;
  return typeof exp === 'number' && exp * 1000 <= Date.now();
}

export function socketAuth(env: Env) {
  return async (socket: Socket, next: (err?: Error) => void) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthPayload;
      if (!(await isSessionValid(env, payload))) {
        return next(new Error('Session is no longer valid'));
      }
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  };
}
