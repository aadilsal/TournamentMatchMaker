import { Router, type Router as ExpressRouter } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../lib/response.js';
import { buildLiveMatch } from './live.service.js';

const params = z.object({ id: z.string().uuid() });

/** Public live scores: no login, read only. */
export function createLiveRouter(pool: Pool): ExpressRouter {
  const router = Router();
  router.get('/matches/:id', validate(params, 'params'), async (req, res, next) => {
    try {
      sendSuccess(res, await buildLiveMatch(pool, req.params.id as string));
    } catch (err) {
      next(err);
    }
  });
  return router;
}
