import { Router } from 'express';
import { declineMatchSchema } from '@vr-tournament/shared';
import type { Pool } from 'pg';
import type { Env } from '../../config/env.js';
import type { RedisClient } from '../../lib/redis.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../lib/response.js';
import { MatchesService } from './matches.service.js';

export function createMatchesRouter(pool: Pool, redis: RedisClient, env: Env): Router {
  const router = Router();
  const service = new MatchesService(pool, redis, env);

  router.get('/me', authenticate(env), async (req, res, next) => {
    try {
      const matches = await service.listByUser(req.user!.sub);
      sendSuccess(res, matches);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', authenticate(env), async (req, res, next) => {
    try {
      const match = await service.getById(req.params.id as string, req.user!.sub);
      sendSuccess(res, match);
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/confirm', authenticate(env), async (req, res, next) => {
    try {
      const match = await service.confirm(req.params.id as string, req.user!.sub);
      sendSuccess(res, match);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/:id/decline',
    authenticate(env),
    validate(declineMatchSchema),
    async (req, res, next) => {
      try {
        const match = await service.decline(req.params.id as string, req.user!.sub, req.body);
        sendSuccess(res, match);
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
