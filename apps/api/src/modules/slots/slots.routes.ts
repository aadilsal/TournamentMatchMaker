import { Router } from 'express';
import { createSlotsSchema, slotListQuerySchema } from '@vr-tournament/shared';
import type { Pool } from 'pg';
import type { Env } from '../../config/env.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../lib/response.js';
import { SlotsService } from './slots.service.js';

export function createSlotsRouter(pool: Pool, env: Env): Router {
  const router = Router({ mergeParams: true });
  const service = new SlotsService(pool);

  router.get('/', validate(slotListQuerySchema, 'query'), async (req, res, next) => {
    try {
      const slots = await service.listByVenueAndDate(
        (req.params.id ?? req.params.venueId) as string,
        (req.query as { date: string }).date
      );
      sendSuccess(res, slots, { total: slots.length });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/',
    authenticate(env),
    requireRole('venue_admin', 'superadmin'),
    validate(createSlotsSchema),
    async (req, res, next) => {
      try {
        const slots = await service.createBulk((req.params.id ?? req.params.venueId) as string, req.body);
        sendSuccess(res, slots, { total: slots.length }, 201);
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
