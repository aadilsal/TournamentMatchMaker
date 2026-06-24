import { Router } from 'express';
import {
  adminAssignTournamentAdminSchema,
  adminAssignVenueAdminSchema,
  adminAuditListQuerySchema,
  adminBookingListQuerySchema,
  adminBuybackListQuerySchema,
  adminBroadcastNotificationSchema,
  adminCreateBookingSchema,
  adminCreateBuybackSchema,
  adminCreateMatchSchema,
  adminCreateNotificationSchema,
  adminCreateRegistrationSchema,
  adminCreateRoundSchema,
  adminCreateUserSchema,
  adminGenerateSlotsSchema,
  adminListQuerySchema,
  adminMatchListQuerySchema,
  adminMatchResultSchema,
  adminNotificationListQuerySchema,
  adminResetPasswordSchema,
  adminTournamentListQuerySchema,
  adminUpdateBookingSchema,
  adminUpdateBuybackSchema,
  adminUpdateMatchSchema,
  adminUpdateParticipantSchema,
  adminUpdateRoundSchema,
  adminUpdateSlotSchema,
  adminUpdateTournamentSchema,
  adminUpdateUserSchema,
  adminUpdateVenueSchema,
  adminVenueListQuerySchema,
  createSlotsSchema,
  createTournamentSchema,
  createVenueSchema,
  tournamentMatchesQuerySchema,
} from '@vr-tournament/shared';
import type { Pool } from 'pg';
import type { Env } from '../../config/env.js';
import type { RedisClient } from '../../lib/redis.js';
import { authenticate } from '../../middleware/auth.js';
import { requireAdmin, requireSuperAdmin } from '../../middleware/admin.js';
import { loadAdminScope, assertVenueAccess, assertTournamentAccess } from '../../middleware/admin-scope.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../lib/response.js';
import { AdminDashboardService, AdminAuditService } from './services/dashboard.service.js';
import { AdminUsersService } from './services/users.service.js';
import { AdminVenuesService } from './services/venues.service.js';
import { AdminBookingsService } from './services/bookings.service.js';
import { AdminTournamentsService } from './services/tournaments.service.js';
import { AdminMatchesService } from './services/matches.service.js';
import {
  AdminBuybacksService,
  AdminNotificationsService,
} from './services/buybacks-notifications.service.js';
import { AdminQueueService, AdminSystemService } from './services/queue-system.service.js';
import { AdminIntegrationsService } from './services/integrations.service.js';

function actorId(req: { user?: { sub: string } }) {
  return req.user!.sub;
}

export function createAdminRouter(pool: Pool, redis: RedisClient, env: Env): Router {
  const router = Router();
  router.use(authenticate(env), requireAdmin(), loadAdminScope(pool));

  const dashboard = new AdminDashboardService(pool, redis);
  const audit = new AdminAuditService(pool);
  const users = new AdminUsersService(pool);
  const venues = new AdminVenuesService(pool, redis);
  const bookings = new AdminBookingsService(pool, redis);
  const tournaments = new AdminTournamentsService(pool, redis, env);
  const matches = new AdminMatchesService(pool, redis, env);
  const buybacks = new AdminBuybacksService(pool, redis, env);
  const notifications = new AdminNotificationsService(pool, env);
  const queue = new AdminQueueService(pool, redis, env);
  const system = new AdminSystemService(pool, redis, env);
  const integrations = new AdminIntegrationsService(env);

  router.get('/dashboard', async (_req, res, next) => {
    try {
      sendSuccess(res, await dashboard.getStats());
    } catch (err) {
      next(err);
    }
  });

  router.get('/audit-logs', validate(adminAuditListQuerySchema, 'query'), async (req, res, next) => {
    try {
      const result = await audit.list(req.query as never);
      sendSuccess(res, result.items, { cursor: result.nextCursor });
    } catch (err) {
      next(err);
    }
  });

  // Users
  router.get('/users', validate(adminListQuerySchema, 'query'), async (req, res, next) => {
    try {
      const result = await users.list(req.query as never);
      sendSuccess(res, result.items, { cursor: result.nextCursor });
    } catch (err) {
      next(err);
    }
  });

  router.post('/users', requireSuperAdmin(), validate(adminCreateUserSchema), async (req, res, next) => {
    try {
      const user = await users.create(actorId(req), req.body);
      sendSuccess(res, user, undefined, 201);
    } catch (err) {
      next(err);
    }
  });

  router.get('/users/:id', async (req, res, next) => {
    try {
      const detail = req.query.detail === 'true';
      sendSuccess(
        res,
        detail
          ? await users.getDetail(req.params.id as string)
          : await users.getById(req.params.id as string)
      );
    } catch (err) {
      next(err);
    }
  });

  router.post('/users/:id/sync-tier', async (req, res, next) => {
    try {
      sendSuccess(res, await users.syncTier(actorId(req), req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.patch('/users/:id', requireSuperAdmin(), validate(adminUpdateUserSchema), async (req, res, next) => {
    try {
      sendSuccess(res, await users.update(actorId(req), req.params.id as string, req.body));
    } catch (err) {
      next(err);
    }
  });

  router.delete('/users/:id', requireSuperAdmin(), async (req, res, next) => {
    try {
      await users.delete(actorId(req), req.params.id as string);
      sendSuccess(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/users/:id/reset-password',
    requireSuperAdmin(),
    validate(adminResetPasswordSchema),
    async (req, res, next) => {
      try {
        await users.resetPassword(actorId(req), req.params.id as string, req.body);
        sendSuccess(res, { reset: true });
      } catch (err) {
        next(err);
      }
    }
  );

  router.delete('/users/:id/sessions', requireSuperAdmin(), async (req, res, next) => {
    try {
      await users.revokeSessions(actorId(req), req.params.id as string);
      sendSuccess(res, { revoked: true });
    } catch (err) {
      next(err);
    }
  });

  // Venues
  router.get('/venues', validate(adminVenueListQuerySchema, 'query'), async (req, res, next) => {
    try {
      const scope = req.adminScope;
      const venueIds = scope?.role === 'venue_admin' ? scope.venueIds : null;
      const result = await venues.list({ ...(req.query as Record<string, unknown>), venueIds } as never);
      sendSuccess(res, result.items, { cursor: result.nextCursor, limit: Number(req.query.limit) || 20 });
    } catch (err) {
      next(err);
    }
  });

  router.post('/venues', validate(createVenueSchema), async (req, res, next) => {
    try {
      const venue = await venues.create(actorId(req), req.body);
      sendSuccess(res, venue, undefined, 201);
    } catch (err) {
      next(err);
    }
  });

  router.get('/venues/:id', async (req, res, next) => {
    try {
      assertVenueAccess(req.adminScope, req.params.id as string);
      sendSuccess(res, await venues.getById(req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.patch('/venues/:id', validate(adminUpdateVenueSchema), async (req, res, next) => {
    try {
      assertVenueAccess(req.adminScope, req.params.id as string);
      sendSuccess(res, await venues.update(actorId(req), req.params.id as string, req.body));
    } catch (err) {
      next(err);
    }
  });

  router.delete('/venues/:id', requireSuperAdmin(), async (req, res, next) => {
    try {
      await venues.delete(actorId(req), req.params.id as string);
      sendSuccess(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  });

  router.get('/venues/:id/slots', async (req, res, next) => {
    try {
      const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
      sendSuccess(res, await venues.listSlots(req.params.id as string, date));
    } catch (err) {
      next(err);
    }
  });

  router.post('/venues/:id/slots', validate(createSlotsSchema), async (req, res, next) => {
    try {
      const slots = await venues.createSlots(actorId(req), req.params.id as string, req.body);
      sendSuccess(res, slots, undefined, 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/venues/:id/slots/generate', validate(adminGenerateSlotsSchema), async (req, res, next) => {
    try {
      const slots = await venues.generateSlots(actorId(req), req.params.id as string, req.body);
      sendSuccess(res, slots, undefined, 201);
    } catch (err) {
      next(err);
    }
  });

  router.get('/venues/:id/admins', async (req, res, next) => {
    try {
      sendSuccess(res, await venues.listVenueAdmins(req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.post('/venues/:id/admins', validate(adminAssignVenueAdminSchema), async (req, res, next) => {
    try {
      await venues.assignVenueAdmin(actorId(req), req.params.id as string, req.body);
      sendSuccess(res, { assigned: true }, undefined, 201);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/venues/:venueId/admins/:userId', async (req, res, next) => {
    try {
      await venues.removeVenueAdmin(actorId(req), req.params.venueId as string, req.params.userId as string);
      sendSuccess(res, { removed: true });
    } catch (err) {
      next(err);
    }
  });

  // Slots
  router.get('/slots', async (req, res, next) => {
    try {
      sendSuccess(
        res,
        await venues.listAllSlots({
          venueId: req.query.venueId as string | undefined,
          date: req.query.date as string | undefined,
          status: req.query.status as string | undefined,
          limit: Number(req.query.limit) || 100,
        })
      );
    } catch (err) {
      next(err);
    }
  });

  router.get('/slots/:id', async (req, res, next) => {
    try {
      sendSuccess(res, await venues.getSlot(req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.patch('/slots/:id', validate(adminUpdateSlotSchema), async (req, res, next) => {
    try {
      sendSuccess(res, await venues.updateSlot(actorId(req), req.params.id as string, req.body));
    } catch (err) {
      next(err);
    }
  });

  router.delete('/slots/:id', async (req, res, next) => {
    try {
      await venues.deleteSlot(actorId(req), req.params.id as string);
      sendSuccess(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/slots/:id/unlock', async (req, res, next) => {
    try {
      sendSuccess(res, await venues.unlockSlot(actorId(req), req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.post('/slots/:id/recount', async (req, res, next) => {
    try {
      sendSuccess(res, await venues.recountSlot(actorId(req), req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  // Bookings
  router.get('/bookings', validate(adminBookingListQuerySchema, 'query'), async (req, res, next) => {
    try {
      const scope = req.adminScope;
      const venueIds = scope?.role === 'venue_admin' ? scope.venueIds : null;
      const result = await bookings.list({ ...(req.query as Record<string, unknown>), venueIds } as never);
      sendSuccess(res, result.items, { cursor: result.nextCursor, limit: Number(req.query.limit) || 20 });
    } catch (err) {
      next(err);
    }
  });

  router.post('/bookings', validate(adminCreateBookingSchema), async (req, res, next) => {
    try {
      const booking = await bookings.create(actorId(req), req.body);
      sendSuccess(res, booking, undefined, 201);
    } catch (err) {
      next(err);
    }
  });

  router.get('/bookings/:id', async (req, res, next) => {
    try {
      sendSuccess(res, await bookings.getById(req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.patch('/bookings/:id', validate(adminUpdateBookingSchema), async (req, res, next) => {
    try {
      sendSuccess(res, await bookings.update(actorId(req), req.params.id as string, req.body));
    } catch (err) {
      next(err);
    }
  });

  router.delete('/bookings/:id', async (req, res, next) => {
    try {
      await bookings.delete(actorId(req), req.params.id as string);
      sendSuccess(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  });

  // Tournaments
  router.get('/tournaments', validate(adminTournamentListQuerySchema, 'query'), async (req, res, next) => {
    try {
      const result = await tournaments.list(req.query as never);
      const scope = req.adminScope;
      let items = result.items;
      if (scope?.role === 'tournament_admin' && scope.tournamentIds) {
        items = items.filter((t) => scope.tournamentIds!.includes(t.id));
      }
      sendSuccess(res, items, { cursor: result.nextCursor });
    } catch (err) {
      next(err);
    }
  });

  router.post('/tournaments', validate(createTournamentSchema), async (req, res, next) => {
    try {
      const t = await tournaments.create(actorId(req), req.body);
      sendSuccess(res, t, undefined, 201);
    } catch (err) {
      next(err);
    }
  });

  router.get('/tournaments/:id', async (req, res, next) => {
    try {
      assertTournamentAccess(req.adminScope, req.params.id as string);
      sendSuccess(res, await tournaments.getById(req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.patch('/tournaments/:id', validate(adminUpdateTournamentSchema), async (req, res, next) => {
    try {
      assertTournamentAccess(req.adminScope, req.params.id as string);
      sendSuccess(res, await tournaments.update(actorId(req), req.params.id as string, req.body));
    } catch (err) {
      next(err);
    }
  });

  router.delete('/tournaments/:id', requireSuperAdmin(), async (req, res, next) => {
    try {
      await tournaments.delete(actorId(req), req.params.id as string);
      sendSuccess(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/tournaments/:id/publish', async (req, res, next) => {
    try {
      sendSuccess(res, await tournaments.publish(actorId(req), req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.post('/tournaments/:id/close-registration', async (req, res, next) => {
    try {
      sendSuccess(res, await tournaments.closeRegistration(actorId(req), req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.post('/tournaments/:id/start', async (req, res, next) => {
    try {
      sendSuccess(res, await tournaments.start(actorId(req), req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.post('/tournaments/:id/complete', async (req, res, next) => {
    try {
      sendSuccess(res, await tournaments.complete(actorId(req), req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.post('/tournaments/:id/close-round', async (req, res, next) => {
    try {
      const roundNumber = Number(req.body.roundNumber) || (await tournaments.getById(req.params.id as string)).currentRoundNumber;
      sendSuccess(res, await tournaments.closeRound(actorId(req), req.params.id as string, roundNumber));
    } catch (err) {
      next(err);
    }
  });

  router.get('/tournaments/:id/rounds', async (req, res, next) => {
    try {
      sendSuccess(res, await tournaments.getRounds(req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.post('/tournaments/:id/rounds', validate(adminCreateRoundSchema), async (req, res, next) => {
    try {
      const round = await tournaments.createRound(actorId(req), req.params.id as string, req.body);
      sendSuccess(res, round, undefined, 201);
    } catch (err) {
      next(err);
    }
  });

  router.get('/tournaments/:id/registrations', async (req, res, next) => {
    try {
      sendSuccess(res, await tournaments.listRegistrations(req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.post('/tournaments/:id/registrations', validate(adminCreateRegistrationSchema), async (req, res, next) => {
    try {
      const reg = await tournaments.createRegistration(actorId(req), req.params.id as string, req.body);
      sendSuccess(res, reg, undefined, 201);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/tournaments/:tournamentId/registrations/:userId', async (req, res, next) => {
    try {
      await tournaments.deleteRegistration(
        actorId(req),
        req.params.tournamentId as string,
        req.params.userId as string
      );
      sendSuccess(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  });

  router.get('/tournaments/:id/participants', async (req, res, next) => {
    try {
      sendSuccess(res, await tournaments.getParticipants(req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.post('/tournaments/:id/participants/sync-stats', async (req, res, next) => {
    try {
      sendSuccess(res, await tournaments.syncParticipantStats(actorId(req), req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.get('/tournaments/:id/matches', validate(tournamentMatchesQuerySchema, 'query'), async (req, res, next) => {
    try {
      sendSuccess(res, await tournaments.getMatches(req.params.id as string, req.query as never));
    } catch (err) {
      next(err);
    }
  });

  router.get('/tournaments/:id/bracket', async (req, res, next) => {
    try {
      sendSuccess(res, await tournaments.getBracket(req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.get('/tournaments/:id/buybacks', async (req, res, next) => {
    try {
      sendSuccess(res, await tournaments.listBuybacks(req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.get('/tournaments/:id/admins', async (req, res, next) => {
    try {
      sendSuccess(res, await tournaments.listTournamentAdmins(req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.post('/tournaments/:id/admins', validate(adminAssignTournamentAdminSchema), async (req, res, next) => {
    try {
      await tournaments.assignTournamentAdmin(actorId(req), req.params.id as string, req.body);
      sendSuccess(res, { assigned: true }, undefined, 201);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/tournaments/:tournamentId/admins/:userId', async (req, res, next) => {
    try {
      await tournaments.removeTournamentAdmin(
        actorId(req),
        req.params.tournamentId as string,
        req.params.userId as string
      );
      sendSuccess(res, { removed: true });
    } catch (err) {
      next(err);
    }
  });

  // Rounds & participants
  router.patch('/rounds/:id', validate(adminUpdateRoundSchema), async (req, res, next) => {
    try {
      sendSuccess(res, await tournaments.updateRound(actorId(req), req.params.id as string, req.body));
    } catch (err) {
      next(err);
    }
  });

  router.get('/participants/:id', async (req, res, next) => {
    try {
      sendSuccess(res, await tournaments.getParticipant(req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.patch('/participants/:id', validate(adminUpdateParticipantSchema), async (req, res, next) => {
    try {
      sendSuccess(res, await tournaments.updateParticipant(actorId(req), req.params.id as string, req.body));
    } catch (err) {
      next(err);
    }
  });

  router.delete('/participants/:id', async (req, res, next) => {
    try {
      await tournaments.deleteParticipant(actorId(req), req.params.id as string);
      sendSuccess(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  });

  // Matches
  router.get('/matches', validate(adminMatchListQuerySchema, 'query'), async (req, res, next) => {
    try {
      const result = await matches.list(req.query as never);
      sendSuccess(res, result.items, { cursor: result.nextCursor });
    } catch (err) {
      next(err);
    }
  });

  router.post('/matches', validate(adminCreateMatchSchema), async (req, res, next) => {
    try {
      const match = await matches.create(actorId(req), req.body);
      sendSuccess(res, match, undefined, 201);
    } catch (err) {
      next(err);
    }
  });

  router.get('/matches/:id', async (req, res, next) => {
    try {
      sendSuccess(res, await matches.getById(req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.patch('/matches/:id', validate(adminUpdateMatchSchema), async (req, res, next) => {
    try {
      sendSuccess(res, await matches.update(actorId(req), req.params.id as string, req.body));
    } catch (err) {
      next(err);
    }
  });

  router.delete('/matches/:id', requireSuperAdmin(), async (req, res, next) => {
    try {
      await matches.delete(actorId(req), req.params.id as string);
      sendSuccess(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/matches/:id/confirm', async (req, res, next) => {
    try {
      sendSuccess(res, await matches.forceConfirm(actorId(req), req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.post('/matches/:id/expire', async (req, res, next) => {
    try {
      sendSuccess(res, await matches.forceExpire(actorId(req), req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.put('/matches/:id/result', validate(adminMatchResultSchema), async (req, res, next) => {
    try {
      sendSuccess(res, await matches.setResult(actorId(req), req.params.id as string, req.body));
    } catch (err) {
      next(err);
    }
  });

  // Buybacks
  router.get('/buybacks', validate(adminBuybackListQuerySchema, 'query'), async (req, res, next) => {
    try {
      const result = await buybacks.list(req.query as never);
      sendSuccess(res, result.items, { cursor: result.nextCursor, limit: Number(req.query.limit) || 20 });
    } catch (err) {
      next(err);
    }
  });

  router.post('/buybacks', validate(adminCreateBuybackSchema), async (req, res, next) => {
    try {
      const b = await buybacks.create(actorId(req), req.body);
      sendSuccess(res, b, undefined, 201);
    } catch (err) {
      next(err);
    }
  });

  router.get('/buybacks/:id', async (req, res, next) => {
    try {
      sendSuccess(res, await buybacks.getById(req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.patch('/buybacks/:id', validate(adminUpdateBuybackSchema), async (req, res, next) => {
    try {
      sendSuccess(res, await buybacks.update(actorId(req), req.params.id as string, req.body));
    } catch (err) {
      next(err);
    }
  });

  router.delete('/buybacks/:id', async (req, res, next) => {
    try {
      await buybacks.delete(actorId(req), req.params.id as string);
      sendSuccess(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  });

  // Notifications
  router.get('/notifications', validate(adminNotificationListQuerySchema, 'query'), async (req, res, next) => {
    try {
      const result = await notifications.list(req.query as never);
      sendSuccess(res, result.items, { cursor: result.nextCursor });
    } catch (err) {
      next(err);
    }
  });

  router.post('/notifications', validate(adminCreateNotificationSchema), async (req, res, next) => {
    try {
      sendSuccess(res, await notifications.create(actorId(req), req.body), undefined, 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/notifications/broadcast', validate(adminBroadcastNotificationSchema), async (req, res, next) => {
    try {
      sendSuccess(res, await notifications.broadcast(actorId(req), req.body));
    } catch (err) {
      next(err);
    }
  });

  router.patch('/notifications/:id/read', async (req, res, next) => {
    try {
      await notifications.markRead(req.params.id as string);
      sendSuccess(res, { read: true });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/notifications/:id', async (req, res, next) => {
    try {
      await notifications.delete(actorId(req), req.params.id as string);
      sendSuccess(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  });

  // Queue
  router.get('/queue', async (_req, res, next) => {
    try {
      sendSuccess(res, await queue.getOverview());
    } catch (err) {
      next(err);
    }
  });

  router.post('/queue/trigger-pair', async (req, res, next) => {
    try {
      sendSuccess(res, await queue.triggerPair(req.body.tournamentId as string | undefined));
    } catch (err) {
      next(err);
    }
  });

  router.delete('/queue/players/:userId', async (req, res, next) => {
    try {
      await queue.removePlayer(actorId(req), req.params.userId as string);
      sendSuccess(res, { removed: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/queue/players/:userId', async (req, res, next) => {
    try {
      await queue.addPlayer(actorId(req), req.params.userId as string, req.body.tournamentId);
      sendSuccess(res, { added: true });
    } catch (err) {
      next(err);
    }
  });

  // System
  router.get('/system/health', async (_req, res, next) => {
    try {
      sendSuccess(res, await system.getHealth());
    } catch (err) {
      next(err);
    }
  });

  router.post('/system/expire-matches', async (_req, res, next) => {
    try {
      sendSuccess(res, await system.expireMatchesNow());
    } catch (err) {
      next(err);
    }
  });

  router.post('/buybacks/:id/refund', requireSuperAdmin(), async (req, res, next) => {
    try {
      sendSuccess(res, await buybacks.refund(actorId(req), req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  // Integrations
  router.get('/integrations', async (_req, res, next) => {
    try {
      sendSuccess(res, integrations.getConfig());
    } catch (err) {
      next(err);
    }
  });

  router.post('/integrations/email/test', async (req, res, next) => {
    try {
      sendSuccess(res, await integrations.sendTestEmail(actorId(req)));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
