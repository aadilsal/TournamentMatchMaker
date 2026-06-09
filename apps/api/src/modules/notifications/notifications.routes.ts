import { Router } from 'express';
import { notificationListQuerySchema } from '@vr-tournament/shared';
import type { Pool } from 'pg';
import type { Env } from '../../config/env.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../lib/response.js';
import { NotificationsService } from './notifications.service.js';

export function createNotificationsRouter(pool: Pool, env: Env): Router {
  const router = Router();
  const service = new NotificationsService(pool);

  router.get('/', authenticate(env), validate(notificationListQuerySchema, 'query'), async (req, res, next) => {
    try {
      const result = await service.list(req.user!.sub, req.query as never);
      sendSuccess(res, result.items, {
        cursor: result.nextCursor,
        total: result.unreadCount,
      });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/read-all', authenticate(env), async (req, res, next) => {
    try {
      const result = await service.markAllRead(req.user!.sub);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id/read', authenticate(env), async (req, res, next) => {
    try {
      const notification = await service.markRead(req.user!.sub, req.params.id as string);
      sendSuccess(res, notification);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
