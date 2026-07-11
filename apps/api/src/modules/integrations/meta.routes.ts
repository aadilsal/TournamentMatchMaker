import { Router } from 'express';
import {
  metaCurrentMatchQuerySchema,
  metaRequestOtpSchema,
  metaSoloTargetSchema,
  metaSubmitScoreSchema,
  metaVerifyOtpSchema,
} from '@vr-tournament/shared';
import type { Pool } from 'pg';
import type { Env } from '../../config/env.js';
import type { RedisClient } from '../../lib/redis.js';
import { metaApiKey } from '../../middleware/metaAuth.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../lib/response.js';
import { MetaIntegrationService } from './meta.service.js';
import { MetaOtpService } from './meta-otp.service.js';

export function createMetaIntegrationRouter(pool: Pool, redis: RedisClient, env: Env): Router {
  const router = Router();
  const service = new MetaIntegrationService(pool, redis, env);
  const otpService = new MetaOtpService(pool, redis, env);

  router.use(metaApiKey(env));

  router.post('/identity/request-otp', validate(metaRequestOtpSchema), async (req, res, next) => {
    try {
      const { email } = req.body as { email: string };
      const data = await otpService.requestOtp(email);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  });

  router.post('/identity/verify-otp', validate(metaVerifyOtpSchema), async (req, res, next) => {
    try {
      const { email, otp } = req.body as { email: string; otp: string };
      const data = await otpService.verifyOtp(email, otp);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  });

  router.get(
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

  router.post(
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

  router.post('/solo-target', validate(metaSoloTargetSchema), async (req, res, next) => {
    try {
      const result = await service.submitSoloTarget(req.body);
      sendSuccess(res, result, undefined, 201);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
