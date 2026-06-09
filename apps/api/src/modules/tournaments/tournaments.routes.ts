import { Router } from 'express';
import {
  createTournamentSchema,
  registerTournamentSchema,
  tournamentListQuerySchema,
} from '@vr-tournament/shared';
import type { Pool } from 'pg';
import type { Env } from '../../config/env.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../lib/response.js';
import { TournamentsService } from './tournaments.service.js';

export function createTournamentsRouter(pool: Pool, env: Env): Router {
  const router = Router();
  const service = new TournamentsService(pool, env);

  router.get('/', validate(tournamentListQuerySchema, 'query'), async (req, res, next) => {
    try {
      const result = await service.list(req.query as never);
      sendSuccess(res, result.items, { cursor: result.nextCursor });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const tournament = await service.getById(req.params.id as string);
      sendSuccess(res, tournament);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/bracket', async (req, res, next) => {
    try {
      const bracket = await service.getBracket(req.params.id as string);
      sendSuccess(res, bracket);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/',
    authenticate(env),
    requireRole('tournament_admin', 'superadmin'),
    validate(createTournamentSchema),
    async (req, res, next) => {
      try {
        const tournament = await service.create(req.body);
        sendSuccess(res, tournament, undefined, 201);
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/:id/register',
    authenticate(env),
    validate(registerTournamentSchema),
    async (req, res, next) => {
      try {
        const registration = await service.register(req.params.id as string, req.user!.sub, req.body);
        sendSuccess(res, registration, undefined, 201);
      } catch (err) {
        next(err);
      }
    }
  );

  router.delete('/:id/register', authenticate(env), async (req, res, next) => {
    try {
      const registration = await service.withdraw(req.params.id as string, req.user!.sub);
      sendSuccess(res, registration);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
