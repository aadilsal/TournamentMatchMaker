import { Router } from 'express';
import { slotListQuerySchema } from '@vr-tournament/shared';
import type { Pool } from 'pg';
import type { Env } from '../../config/env.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../lib/response.js';
import { SlotsService } from './slots.service.js';

// Slot creation lives only under /admin/venues/:id/slots, where venue scope is enforced.
export function createSlotsRouter(pool: Pool, _env: Env): Router {
  const router = Router({ mergeParams: true });
  const service = new SlotsService(pool);

  router.get('/', validate(slotListQuerySchema, 'query'), async (req, res, next) => {
    try {
      const slots = await service.listByVenueAndDate(
        (req.params.id ?? req.params.venueId) as string,
        (req.query as { date: string }).date,
        (req.query as { tz?: string }).tz
      );
      sendSuccess(res, slots, { total: slots.length });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
