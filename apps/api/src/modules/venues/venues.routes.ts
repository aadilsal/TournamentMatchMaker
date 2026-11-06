import { Router } from 'express';
import { venueListQuerySchema } from '@vr-tournament/shared';
import type { Pool } from 'pg';
import type { VenueListQuery } from '@vr-tournament/shared';
import type { RedisClient } from '../../lib/redis.js';
import type { Env } from '../../config/env.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../lib/response.js';
import { VenuesService } from './venues.service.js';

// Venue creation lives only under /admin/venues (superadmin-only).
export function createVenuesRouter(pool: Pool, redis: RedisClient, _env: Env): Router {
  const router = Router();
  const service = new VenuesService(pool, redis);

  router.get('/', validate(venueListQuerySchema, 'query'), async (req, res, next) => {
    try {
      const venues = await service.list(req.query as unknown as VenueListQuery);
      sendSuccess(res, venues, { total: venues.length });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const venue = await service.getById(req.params.id as string);
      sendSuccess(res, venue);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
