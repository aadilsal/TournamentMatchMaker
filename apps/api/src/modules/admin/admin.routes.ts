import { Router, type Request } from 'express';
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
  adminSlotListQuerySchema,
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
  slotListQuerySchema,
  adminUserLookupQuerySchema,
  createTournamentSchema,
  createVenueSchema,
  tournamentMatchesQuerySchema,
} from '@vr-tournament/shared';
import type { Pool } from 'pg';
import type { Env } from '../../config/env.js';
import type { RedisClient } from '../../lib/redis.js';
import { authenticate } from '../../middleware/auth.js';
import { requireAdmin, requireSuperAdmin, requireAdminRoles } from '../../middleware/admin.js';
import {
  loadAdminScope,
  assertVenueAccess,
  assertTournamentAccess,
  guardVenueAccess,
  guardTournamentAccess,
  guardOwnedResource,
  OWNER_SQL,
} from '../../middleware/admin-scope.js';
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

type Page<T> = { items: T[]; nextCursor: string | null };

/** Runs a tournament-filtered list inside the caller's tournament scope. */
async function listInTournamentScope<T extends { tournamentId: string | null }>(
  req: Request,
  list: (query: never) => Promise<Page<T>>
): Promise<Page<T>> {
  const query = req.query as { tournamentId?: string };
  const ids = req.adminScope?.tournamentIds ?? null;
  if (ids === null) return list(query as never);
  if (query.tournamentId) {
    assertTournamentAccess(req.adminScope, query.tournamentId);
    return list(query as never);
  }
  return list({ ...query, tournamentIds: ids } as never);
}

export function createAdminRouter(pool: Pool, redis: RedisClient, env: Env): Router {
  const router = Router();
  router.use(authenticate(env), requireAdmin(), loadAdminScope(pool));

  // `requireAdmin` only proves the caller is *an* admin. Everything below
  // that touches a specific venue or tournament must also prove it is
  // *their* venue or tournament; anything global stays superadmin-only.
  const ownsVenue = guardVenueAccess('id');
  const ownsTournament = guardTournamentAccess('id');
  const owns = (sql: string, param?: string) => guardOwnedResource(pool, sql, param);

  // Sections the admin sidebar reserves for superadmin + tournament_admin.
  // The list endpoints behind them were reachable by a venue_admin, who could
  // read every player's notifications through the API even though the section
  // is hidden from them. `requireAdminRoles` always lets superadmin through.
  const tournamentSection = requireAdminRoles('tournament_admin');

  const dashboard = new AdminDashboardService(pool, redis);
  const audit = new AdminAuditService(pool);
  const users = new AdminUsersService(pool, redis);
  const venues = new AdminVenuesService(pool, redis);
  const bookings = new AdminBookingsService(pool, redis);
  const tournaments = new AdminTournamentsService(pool, redis, env);
  const matches = new AdminMatchesService(pool, redis, env);
  const buybacks = new AdminBuybacksService(pool, redis, env);
  const notifications = new AdminNotificationsService(pool, env);
  const queue = new AdminQueueService(pool, redis, env);
  const system = new AdminSystemService(pool, redis, env);
  const integrations = new AdminIntegrationsService(env, pool);

  router.get('/dashboard', async (req, res, next) => {
    try {
      sendSuccess(res, await dashboard.getStats(req.adminScope));
    } catch (err) {
      next(err);
    }
  });

  router.get('/audit-logs', requireSuperAdmin(), validate(adminAuditListQuerySchema, 'query'), async (req, res, next) => {
    try {
      const result = await audit.list(req.query as never);
      sendSuccess(res, result.items, { cursor: result.nextCursor });
    } catch (err) {
      next(err);
    }
  });

  // Users
  router.get('/users', requireSuperAdmin(), validate(adminListQuerySchema, 'query'), async (req, res, next) => {
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

  // Registered before /users/:id so "lookup" is not read as an id.
  router.get('/users/lookup', validate(adminUserLookupQuerySchema, 'query'), async (req, res, next) => {
    try {
      sendSuccess(res, await users.lookup(req.query as never));
    } catch (err) {
      next(err);
    }
  });

  router.get('/users/:id', requireSuperAdmin(), async (req, res, next) => {
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

  router.post('/users/:id/sync-tier', requireSuperAdmin(), async (req, res, next) => {
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
      const { anonymised } = await users.delete(actorId(req), req.params.id as string);
      sendSuccess(res, { deleted: true, anonymised });
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
      const venueIds = req.adminScope?.venueIds ?? null;
      const result = await venues.list({ ...(req.query as Record<string, unknown>), venueIds } as never);
      sendSuccess(res, result.items, { cursor: result.nextCursor, limit: Number(req.query.limit) || 20 });
    } catch (err) {
      next(err);
    }
  });

  router.post('/venues', requireSuperAdmin(), validate(createVenueSchema), async (req, res, next) => {
    try {
      const venue = await venues.create(actorId(req), req.body);
      sendSuccess(res, venue, undefined, 201);
    } catch (err) {
      next(err);
    }
  });

  router.get('/venues/:id', ownsVenue, async (req, res, next) => {
    try {
      assertVenueAccess(req.adminScope, req.params.id as string);
      sendSuccess(res, await venues.getById(req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.patch('/venues/:id', ownsVenue, validate(adminUpdateVenueSchema), async (req, res, next) => {
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

  router.get('/venues/:id/slots', ownsVenue, validate(slotListQuerySchema.partial({ date: true }), 'query'), async (req, res, next) => {
    try {
      const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
      sendSuccess(res, await venues.listSlots(req.params.id as string, date, req.query.tz as string | undefined));
    } catch (err) {
      next(err);
    }
  });

  router.post('/venues/:id/slots', ownsVenue, validate(createSlotsSchema), async (req, res, next) => {
    try {
      const slots = await venues.createSlots(actorId(req), req.params.id as string, req.body);
      sendSuccess(res, slots, undefined, 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/venues/:id/slots/generate', ownsVenue, validate(adminGenerateSlotsSchema), async (req, res, next) => {
    try {
      const slots = await venues.generateSlots(actorId(req), req.params.id as string, req.body);
      sendSuccess(res, slots, undefined, 201);
    } catch (err) {
      next(err);
    }
  });

  router.get('/venues/:id/admins', ownsVenue, async (req, res, next) => {
    try {
      sendSuccess(res, await venues.listVenueAdmins(req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.post('/venues/:id/admins', requireSuperAdmin(), validate(adminAssignVenueAdminSchema), async (req, res, next) => {
    try {
      await venues.assignVenueAdmin(actorId(req), req.params.id as string, req.body);
      sendSuccess(res, { assigned: true }, undefined, 201);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/venues/:venueId/admins/:userId', requireSuperAdmin(), async (req, res, next) => {
    try {
      await venues.removeVenueAdmin(actorId(req), req.params.venueId as string, req.params.userId as string);
      sendSuccess(res, { removed: true });
    } catch (err) {
      next(err);
    }
  });

  // Slots
  router.get('/slots', validate(adminSlotListQuerySchema, 'query'), async (req, res, next) => {
    try {
      const query = req.query as unknown as { venueId?: string; date?: string; status?: string; limit: number };
      if (query.venueId) assertVenueAccess(req.adminScope, query.venueId);
      sendSuccess(
        res,
        await venues.listAllSlots({ ...query, venueIds: req.adminScope?.venueIds ?? null })
      );
    } catch (err) {
      next(err);
    }
  });

  router.get('/slots/:id', owns(OWNER_SQL.slot), async (req, res, next) => {
    try {
      sendSuccess(res, await venues.getSlot(req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.patch('/slots/:id', owns(OWNER_SQL.slot), validate(adminUpdateSlotSchema), async (req, res, next) => {
    try {
      sendSuccess(res, await venues.updateSlot(actorId(req), req.params.id as string, req.body));
    } catch (err) {
      next(err);
    }
  });

  router.delete('/slots/:id', owns(OWNER_SQL.slot), async (req, res, next) => {
    try {
      await venues.deleteSlot(actorId(req), req.params.id as string);
      sendSuccess(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/slots/:id/unlock', owns(OWNER_SQL.slot), async (req, res, next) => {
    try {
      sendSuccess(res, await venues.unlockSlot(actorId(req), req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.post('/slots/:id/recount', owns(OWNER_SQL.slot), async (req, res, next) => {
    try {
      sendSuccess(res, await venues.recountSlot(actorId(req), req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  // Bookings
  router.get('/bookings', validate(adminBookingListQuerySchema, 'query'), async (req, res, next) => {
    try {
      const venueIds = req.adminScope?.venueIds ?? null;
      const venueId = (req.query as { venueId?: string }).venueId;
      if (venueId) assertVenueAccess(req.adminScope, venueId);
      // The service treats [] as "no filter", so an admin with no venues must stop here.
      if (!venueId && venueIds?.length === 0) return sendSuccess(res, [], { cursor: null });
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

  router.get('/bookings/:id', owns(OWNER_SQL.booking), async (req, res, next) => {
    try {
      sendSuccess(res, await bookings.getById(req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.patch('/bookings/:id', owns(OWNER_SQL.booking), validate(adminUpdateBookingSchema), async (req, res, next) => {
    try {
      sendSuccess(res, await bookings.update(actorId(req), req.params.id as string, req.body));
    } catch (err) {
      next(err);
    }
  });

  router.delete('/bookings/:id', owns(OWNER_SQL.booking), async (req, res, next) => {
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
      const tournamentIds = req.adminScope?.tournamentIds ?? null;
      const result = await tournaments.list({ ...(req.query as Record<string, unknown>), tournamentIds } as never);
      sendSuccess(res, result.items, { cursor: result.nextCursor });
    } catch (err) {
      next(err);
    }
  });

  router.post('/tournaments', requireSuperAdmin(), validate(createTournamentSchema), async (req, res, next) => {
    try {
      const t = await tournaments.create(actorId(req), req.body);
      sendSuccess(res, t, undefined, 201);
    } catch (err) {
      next(err);
    }
  });

  router.get('/tournaments/:id', ownsTournament, async (req, res, next) => {
    try {
      assertTournamentAccess(req.adminScope, req.params.id as string);
      sendSuccess(res, await tournaments.getById(req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.patch('/tournaments/:id', ownsTournament, validate(adminUpdateTournamentSchema), async (req, res, next) => {
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

  router.post('/tournaments/:id/publish', ownsTournament, async (req, res, next) => {
    try {
      sendSuccess(res, await tournaments.publish(actorId(req), req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.post('/tournaments/:id/close-registration', ownsTournament, async (req, res, next) => {
    try {
      sendSuccess(res, await tournaments.closeRegistration(actorId(req), req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.post('/tournaments/:id/start', ownsTournament, async (req, res, next) => {
    try {
      sendSuccess(res, await tournaments.start(actorId(req), req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.post('/tournaments/:id/complete', ownsTournament, async (req, res, next) => {
    try {
      sendSuccess(res, await tournaments.complete(actorId(req), req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.post('/tournaments/:id/close-round', ownsTournament, async (req, res, next) => {
    try {
      const roundNumber = Number(req.body.roundNumber) || (await tournaments.getById(req.params.id as string)).currentRoundNumber;
      sendSuccess(res, await tournaments.closeRound(actorId(req), req.params.id as string, roundNumber));
    } catch (err) {
      next(err);
    }
  });

  router.get('/tournaments/:id/rounds', ownsTournament, async (req, res, next) => {
    try {
      sendSuccess(res, await tournaments.getRounds(req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.post('/tournaments/:id/rounds', ownsTournament, validate(adminCreateRoundSchema), async (req, res, next) => {
    try {
      const round = await tournaments.createRound(actorId(req), req.params.id as string, req.body);
      sendSuccess(res, round, undefined, 201);
    } catch (err) {
      next(err);
    }
  });

  router.get('/tournaments/:id/registrations', ownsTournament, async (req, res, next) => {
    try {
      sendSuccess(
        res,
        await tournaments.listRegistrations(req.params.id as string, req.adminScope?.role === 'superadmin')
      );
    } catch (err) {
      next(err);
    }
  });

  router.post('/tournaments/:id/registrations', ownsTournament, validate(adminCreateRegistrationSchema), async (req, res, next) => {
    try {
      const reg = await tournaments.createRegistration(actorId(req), req.params.id as string, req.body);
      sendSuccess(res, reg, undefined, 201);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/tournaments/:tournamentId/registrations/:userId', guardTournamentAccess('tournamentId'), async (req, res, next) => {
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

  router.get('/tournaments/:id/participants', ownsTournament, async (req, res, next) => {
    try {
      sendSuccess(res, await tournaments.getParticipants(req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.post('/tournaments/:id/participants/sync-stats', ownsTournament, async (req, res, next) => {
    try {
      sendSuccess(res, await tournaments.syncParticipantStats(actorId(req), req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.get('/tournaments/:id/matches', ownsTournament, validate(tournamentMatchesQuerySchema, 'query'), async (req, res, next) => {
    try {
      sendSuccess(res, await tournaments.getMatches(req.params.id as string, req.query as never));
    } catch (err) {
      next(err);
    }
  });

  router.get('/tournaments/:id/bracket', ownsTournament, async (req, res, next) => {
    try {
      sendSuccess(res, await tournaments.getBracket(req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.get('/tournaments/:id/buybacks', ownsTournament, async (req, res, next) => {
    try {
      sendSuccess(res, await tournaments.listBuybacks(req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.get('/tournaments/:id/admins', ownsTournament, async (req, res, next) => {
    try {
      sendSuccess(res, await tournaments.listTournamentAdmins(req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.post('/tournaments/:id/admins', requireSuperAdmin(), validate(adminAssignTournamentAdminSchema), async (req, res, next) => {
    try {
      await tournaments.assignTournamentAdmin(actorId(req), req.params.id as string, req.body);
      sendSuccess(res, { assigned: true }, undefined, 201);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/tournaments/:tournamentId/admins/:userId', requireSuperAdmin(), async (req, res, next) => {
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
  router.patch('/rounds/:id', owns(OWNER_SQL.round), validate(adminUpdateRoundSchema), async (req, res, next) => {
    try {
      sendSuccess(res, await tournaments.updateRound(actorId(req), req.params.id as string, req.body));
    } catch (err) {
      next(err);
    }
  });

  router.get('/participants/:id', owns(OWNER_SQL.participant), async (req, res, next) => {
    try {
      sendSuccess(res, await tournaments.getParticipant(req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.patch('/participants/:id', owns(OWNER_SQL.participant), validate(adminUpdateParticipantSchema), async (req, res, next) => {
    try {
      sendSuccess(res, await tournaments.updateParticipant(actorId(req), req.params.id as string, req.body));
    } catch (err) {
      next(err);
    }
  });

  router.delete('/participants/:id', owns(OWNER_SQL.participant), async (req, res, next) => {
    try {
      await tournaments.deleteParticipant(actorId(req), req.params.id as string);
      sendSuccess(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  });

  // Matches
  router.get('/matches', tournamentSection, validate(adminMatchListQuerySchema, 'query'), async (req, res, next) => {
    try {
      const result = await listInTournamentScope(req, (q) => matches.list(q));
      sendSuccess(res, result.items, { cursor: result.nextCursor });
    } catch (err) {
      next(err);
    }
  });

  router.post('/matches', requireSuperAdmin(), validate(adminCreateMatchSchema), async (req, res, next) => {
    try {
      const match = await matches.create(actorId(req), req.body);
      sendSuccess(res, match, undefined, 201);
    } catch (err) {
      next(err);
    }
  });

  router.get('/matches/:id', owns(OWNER_SQL.match), async (req, res, next) => {
    try {
      sendSuccess(res, await matches.getById(req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.patch('/matches/:id', owns(OWNER_SQL.match), validate(adminUpdateMatchSchema), async (req, res, next) => {
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

  router.post('/matches/:id/confirm', owns(OWNER_SQL.match), async (req, res, next) => {
    try {
      sendSuccess(res, await matches.forceConfirm(actorId(req), req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.post('/matches/:id/expire', owns(OWNER_SQL.match), async (req, res, next) => {
    try {
      sendSuccess(res, await matches.forceExpire(actorId(req), req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.put('/matches/:id/result', owns(OWNER_SQL.match), validate(adminMatchResultSchema), async (req, res, next) => {
    try {
      sendSuccess(res, await matches.setResult(actorId(req), req.params.id as string, req.body));
    } catch (err) {
      next(err);
    }
  });

  // Buybacks
  router.get('/buybacks', tournamentSection, validate(adminBuybackListQuerySchema, 'query'), async (req, res, next) => {
    try {
      const result = await listInTournamentScope(req, (q) => buybacks.list(q));
      sendSuccess(res, result.items, { cursor: result.nextCursor, limit: Number(req.query.limit) || 20 });
    } catch (err) {
      next(err);
    }
  });

  router.post('/buybacks', requireSuperAdmin(), validate(adminCreateBuybackSchema), async (req, res, next) => {
    try {
      const b = await buybacks.create(actorId(req), req.body);
      sendSuccess(res, b, undefined, 201);
    } catch (err) {
      next(err);
    }
  });

  router.get('/buybacks/:id', owns(OWNER_SQL.buyback), async (req, res, next) => {
    try {
      sendSuccess(res, await buybacks.getById(req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  router.patch('/buybacks/:id', owns(OWNER_SQL.buyback), validate(adminUpdateBuybackSchema), async (req, res, next) => {
    try {
      sendSuccess(res, await buybacks.update(actorId(req), req.params.id as string, req.body));
    } catch (err) {
      next(err);
    }
  });

  router.delete('/buybacks/:id', owns(OWNER_SQL.buyback), async (req, res, next) => {
    try {
      await buybacks.delete(actorId(req), req.params.id as string);
      sendSuccess(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  });

  // Notifications
  // Superadmin-only: the service cannot narrow notifications to a scoped admin's players.
  router.get('/notifications', requireSuperAdmin(), validate(adminNotificationListQuerySchema, 'query'), async (req, res, next) => {
    try {
      const result = await notifications.list(req.query as never);
      sendSuccess(res, result.items, { cursor: result.nextCursor });
    } catch (err) {
      next(err);
    }
  });

  router.post('/notifications', requireSuperAdmin(), validate(adminCreateNotificationSchema), async (req, res, next) => {
    try {
      sendSuccess(res, await notifications.create(actorId(req), req.body), undefined, 201);
    } catch (err) {
      next(err);
    }
  });

  router.post('/notifications/broadcast', requireSuperAdmin(), validate(adminBroadcastNotificationSchema), async (req, res, next) => {
    try {
      sendSuccess(res, await notifications.broadcast(actorId(req), req.body));
    } catch (err) {
      next(err);
    }
  });

  router.patch('/notifications/:id/read', requireSuperAdmin(), async (req, res, next) => {
    try {
      await notifications.markRead(req.params.id as string);
      sendSuccess(res, { read: true });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/notifications/:id', requireSuperAdmin(), async (req, res, next) => {
    try {
      await notifications.delete(actorId(req), req.params.id as string);
      sendSuccess(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  });

  // Queue
  router.get('/queue', requireSuperAdmin(), async (_req, res, next) => {
    try {
      sendSuccess(res, await queue.getOverview());
    } catch (err) {
      next(err);
    }
  });

  router.post('/queue/trigger-pair', requireSuperAdmin(), async (req, res, next) => {
    try {
      sendSuccess(res, await queue.triggerPair(req.body.tournamentId as string | undefined));
    } catch (err) {
      next(err);
    }
  });

  router.delete('/queue/players/:userId', requireSuperAdmin(), async (req, res, next) => {
    try {
      await queue.removePlayer(actorId(req), req.params.userId as string);
      sendSuccess(res, { removed: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/queue/players/:userId', requireSuperAdmin(), async (req, res, next) => {
    try {
      await queue.addPlayer(actorId(req), req.params.userId as string, req.body.tournamentId);
      sendSuccess(res, { added: true });
    } catch (err) {
      next(err);
    }
  });

  // System
  router.get('/system/health', requireSuperAdmin(), async (_req, res, next) => {
    try {
      sendSuccess(res, await system.getHealth());
    } catch (err) {
      next(err);
    }
  });

  router.post('/system/expire-matches', requireSuperAdmin(), async (_req, res, next) => {
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
  router.get('/integrations', requireSuperAdmin(), async (_req, res, next) => {
    try {
      sendSuccess(res, integrations.getConfig());
    } catch (err) {
      next(err);
    }
  });

  router.post('/integrations/email/test', requireSuperAdmin(), async (req, res, next) => {
    try {
      sendSuccess(res, await integrations.sendTestEmail(actorId(req)));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
