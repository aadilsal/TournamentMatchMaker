import { Router } from 'express';
import { updatePlayerSchema } from '@vr-tournament/shared';
import type { Pool } from 'pg';
import type { Env } from '../../config/env.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../lib/response.js';
import { PlayersService } from './players.service.js';

export function createPlayersRouter(pool: Pool, env: Env): Router {
  const router = Router();
  const service = new PlayersService(pool);

  router.get('/me', authenticate(env), async (req, res, next) => {
    try {
      const profile = await service.getProfile(req.user!.sub);
      sendSuccess(res, profile);
    } catch (err) {
      next(err);
    }
  });

  router.patch('/me', authenticate(env), validate(updatePlayerSchema), async (req, res, next) => {
    try {
      const profile = await service.updateProfile(req.user!.sub, req.body);
      sendSuccess(res, profile);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
