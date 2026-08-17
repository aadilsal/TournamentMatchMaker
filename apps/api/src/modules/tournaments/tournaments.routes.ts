import { Router } from 'express';
import {
  buybackSchema,
  createTournamentSchema,
  enterTournamentSchema,
  registerTournamentSchema,
  tournamentListQuerySchema,
  tournamentMatchesQuerySchema,
  tournamentSlotOptionsQuerySchema,
} from '@vr-tournament/shared';
import type { Pool } from 'pg';
import type { Env } from '../../config/env.js';
import type { RedisClient } from '../../lib/redis.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../lib/response.js';
import { TournamentsService } from './tournaments.service.js';

export function createTournamentsRouter(pool: Pool, redis: RedisClient, env: Env): Router {
  const router = Router();
  const service = new TournamentsService(pool, redis, env);

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

  router.get('/:id/registration', authenticate(env), async (req, res, next) => {
    try {
      const registration = await service.getRegistration(req.params.id as string, req.user!.sub);
      sendSuccess(res, registration);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/participant', authenticate(env), async (req, res, next) => {
    try {
      const participant = await service.getParticipant(req.params.id as string, req.user!.sub);
      sendSuccess(res, participant);
    } catch (err) {
      next(err);
    }
  });

  /** Slots the player may pick for their current round (VR: any venue, venue players: their venue). */
  router.get(
    '/:id/slot-options',
    authenticate(env),
    validate(tournamentSlotOptionsQuerySchema, 'query'),
    async (req, res, next) => {
      try {
        const options = await service.getSlotOptions(
          req.params.id as string,
          req.user!.sub,
          req.query as never
        );
        sendSuccess(res, options);
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * Whether this player has to pick a play window before they can be paired,
   * and what to default it to. Drives the entry screen for a first entry, a
   * round they have just advanced into, and a draw they owe a replay for.
   */
  router.get('/:id/entry-state', authenticate(env), async (req, res, next) => {
    try {
      const state = await service.getEntryState(req.params.id as string, req.user!.sub);
      sendSuccess(res, state);
    } catch (err) {
      next(err);
    }
  });

  /** The slot the player already holds — used to preselect it on the next round. */
  router.get('/:id/my-slot', authenticate(env), async (req, res, next) => {
    try {
      const roundSlot = await service.getLatestRoundSlot(req.params.id as string, req.user!.sub);
      sendSuccess(res, roundSlot);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/rounds', async (req, res, next) => {
    try {
      const rounds = await service.getRounds(req.params.id as string);
      sendSuccess(res, rounds);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/participants', async (req, res, next) => {
    try {
      const participants = await service.getParticipants(req.params.id as string);
      sendSuccess(res, participants);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/matches', validate(tournamentMatchesQuerySchema, 'query'), async (req, res, next) => {
    try {
      const matches = await service.getMatches(req.params.id as string, req.query as never);
      sendSuccess(res, matches);
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

  router.post(
    '/:id/enter',
    authenticate(env),
    validate(enterTournamentSchema),
    async (req, res, next) => {
      try {
        const result = await service.enter(req.params.id as string, req.user!.sub, req.body);
        sendSuccess(res, result, undefined, 201);
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/:id/buyback/checkout',
    authenticate(env),
    validate(buybackSchema),
    async (req, res, next) => {
      try {
        const session = await service.createBuybackCheckout(
          req.params.id as string,
          req.user!.sub,
          req.body
        );
        sendSuccess(res, session, undefined, 201);
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
