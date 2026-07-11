import { Router } from 'express';
import {
  metaCurrentMatchQuerySchema,
  metaSoloTargetSchema,
  metaSubmitScoreSchema,
  metaVerifyLinkCodeSchema,
} from '@vr-tournament/shared';
import type { Pool } from 'pg';
import type { Env } from '../../config/env.js';
import type { RedisClient } from '../../lib/redis.js';
import { metaApiKey } from '../../middleware/metaAuth.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../lib/response.js';
import { MetaIntegrationService } from './meta.service.js';
import { MetaLinkService } from './meta-link.service.js';

export function createMetaIntegrationRouter(pool: Pool, redis: RedisClient, env: Env): Router {
  const router = Router();
  const service = new MetaIntegrationService(pool, redis, env);
  const linkService = new MetaLinkService(pool, redis, env);

  // 1. Web App Endpoint: Generate a new 4-digit code (Requires web login session)
  router.get('/link-code', authenticate(env), async (req, res, next) => {
    try {
      const data = await linkService.generateLinkCode(req.user!.sub);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  });

  // 2. VR Headset Endpoints (Requires Meta API Key)
  const metaApiRouter = Router();
  metaApiRouter.use(metaApiKey(env));

  metaApiRouter.post(
    '/identity/verify-link-code',
    validate(metaVerifyLinkCodeSchema),
    async (req, res, next) => {
      try {
        const { code } = req.body as { code: string };
        const data = await linkService.verifyLinkCode(code);
        sendSuccess(res, data);
      } catch (err) {
        next(err);
      }
    }
  );

  metaApiRouter.get(
    '/matches/current',
    validate(metaCurrentMatchQuerySchema, 'query'),
    async (req, res, next) => {
      try {
        const { userId } = req.query as { userId: string };
        const data = await service.getCurrentMatch(userId);
        sendSuccess(res, data);
      } catch (err) {
        next(err);
      }
    }
  );

  metaApiRouter.post(
    '/matches/:id/scores',
    validate(metaSubmitScoreSchema),
    async (req, res, next) => {
      try {
        const match = await service.submitScore(req.params.id as string, req.body);
        sendSuccess(res, match);
      } catch (err) {
        next(err);
      }
    }
  );

  metaApiRouter.post('/solo-target', validate(metaSoloTargetSchema), async (req, res, next) => {
    try {
      const result = await service.submitSoloTarget(req.body);
      sendSuccess(res, result, undefined, 201);
    } catch (err) {
      next(err);
    }
  });

  router.use('/', metaApiRouter);

  return router;
}
