import { Router } from 'express';
import { registerSchema, loginSchema } from '@vr-tournament/shared';
import type { Pool } from 'pg';
import type { RedisClient } from '../../lib/redis.js';
import type { Env } from '../../config/env.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/auth.js';
import { sendSuccess } from '../../lib/response.js';
import { AuthService } from './auth.service.js';

export function createAuthRouter(pool: Pool, redis: RedisClient, env: Env): Router {
  const router = Router();
  const authService = new AuthService(pool, redis, env);

  router.post('/register', validate(registerSchema), async (req, res, next) => {
    try {
      const result = await authService.register(req.body);
      res.cookie(
        result.refreshCookieName,
        result.refreshToken,
        authService.getRefreshCookieOptions()
      );
      sendSuccess(res, { accessToken: result.accessToken, user: result.user }, {}, 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/login', validate(loginSchema), async (req, res, next) => {
    try {
      const result = await authService.login(req.body.email, req.body.password);
      res.cookie(
        result.refreshCookieName,
        result.refreshToken,
        authService.getRefreshCookieOptions()
      );
      sendSuccess(res, { accessToken: result.accessToken, user: result.user });
    } catch (err) {
      next(err);
    }
  });

  router.post('/refresh', async (req, res, next) => {
    try {
      const refreshToken = req.cookies?.refresh_token;
      if (!refreshToken) {
        return res.status(401).json({
          success: false,
          data: null,
          error: { code: 'UNAUTHORIZED', message: 'Refresh token missing' },
          meta: {},
        });
      }

      const result = await authService.refresh(refreshToken);
      res.cookie(
        result.refreshCookieName,
        result.refreshToken,
        authService.getRefreshCookieOptions()
      );
      sendSuccess(res, { accessToken: result.accessToken, user: result.user });
    } catch (err) {
      next(err);
    }
  });

  router.post('/logout', authenticate(env), async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      let jti: string | undefined;
      let exp: number | undefined;

      if (authHeader?.startsWith('Bearer ')) {
        const jwt = await import('jsonwebtoken');
        const decoded = jwt.default.decode(authHeader.slice(7)) as { jti?: string; exp?: number } | null;
        jti = decoded?.jti;
        exp = decoded?.exp;
      }

      await authService.logout(req.user!.sub, jti, exp);
      res.clearCookie('refresh_token', { path: '/api/v1/auth' });
      sendSuccess(res, { message: 'Logged out successfully' });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
