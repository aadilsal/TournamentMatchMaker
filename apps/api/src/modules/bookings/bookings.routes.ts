import { Router } from 'express';
import { createBookingSchema } from '@vr-tournament/shared';
import type { Pool } from 'pg';
import type { RedisClient } from '../../lib/redis.js';
import type { Env } from '../../config/env.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../lib/response.js';
import { BookingsService } from './bookings.service.js';

export function createBookingsRouter(pool: Pool, redis: RedisClient, env: Env): Router {
  const router = Router();
  const service = new BookingsService(pool, redis);

  router.get('/me', authenticate(env), async (req, res, next) => {
    try {
      const bookings = await service.listByUser(req.user!.sub);
      sendSuccess(res, bookings, { total: bookings.length });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', authenticate(env), validate(createBookingSchema), async (req, res, next) => {
    try {
      const booking = await service.create(req.user!.sub, req.body.timeSlotId);
      sendSuccess(res, booking, {}, 201);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', authenticate(env), async (req, res, next) => {
    try {
      const booking = await service.cancel(req.user!.sub, req.params.id as string);
      sendSuccess(res, booking);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
