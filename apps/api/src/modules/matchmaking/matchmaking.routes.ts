import { Router } from 'express';
import { joinQueueSchema } from '@vr-tournament/shared';
import type { Pool } from 'pg';
import type { Env } from '../../config/env.js';
import type { RedisClient } from '../../lib/redis.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../lib/response.js';
import { MatchmakingService } from './matchmaking.service.js';

export function createMatchmakingRouter(pool: Pool, redis: RedisClient, env: Env): Router {
  const router = Router();
  const service = new MatchmakingService(pool, redis);

  router.post('/queue', authenticate(env), validate(joinQueueSchema), async (req, res, next) => {
    try {
      const status = await service.join(req.user!.sub, req.body);
      sendSuccess(res, status, undefined, 201);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/queue', authenticate(env), async (req, res, next) => {
    try {
      const status = await service.leave(req.user!.sub);
      sendSuccess(res, status);
    } catch (err) {
      next(err);
    }
  });

  router.get('/status', authenticate(env), async (req, res, next) => {
    try {
      const status = await service.getStatus(req.user!.sub);
      sendSuccess(res, status);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
