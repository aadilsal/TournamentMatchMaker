import { z } from 'zod';
import { createVenueSchema } from './venue.js';
import { createSlotsSchema } from './slot.js';
import { createTournamentSchema, tournamentStatusSchema } from './tournament.js';

export const userRoleSchema = z.enum(['player', 'venue_admin', 'tournament_admin', 'superadmin']);

export const adminListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  role: userRoleSchema.optional(),
});

export const adminCreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/),
  country: z.string().max(100).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  hasVrHeadset: z.boolean().optional(),
  vrDeviceType: z.string().max(100).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  role: userRoleSchema.optional().default('player'),
  skillTier: z.number().int().min(1).max(5).optional(),
  ratingPoints: z.number().int().min(0).optional(),
});

export const adminUpdateUserSchema = z.object({
  email: z.string().email().optional(),
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/).optional(),
  country: z.string().max(100).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  hasVrHeadset: z.boolean().optional(),
  vrDeviceType: z.string().max(100).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  role: userRoleSchema.optional(),
  skillTier: z.number().int().min(1).max(5).optional(),
  ratingPoints: z.number().int().min(0).optional(),
  suspended: z.boolean().optional(),
});

export const adminResetPasswordSchema = z.object({
  password: z.string().min(8).max(128),
});

export type AdminResetPasswordInput = z.infer<typeof adminResetPasswordSchema>;

export const adminUpdateVenueSchema = createVenueSchema.partial();

export const adminSlotListQuerySchema = z.object({
  venueId: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(['available', 'full', 'locked']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const adminUpdateSlotSchema = z.object({
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  maxCapacity: z.number().int().min(1).optional(),
  status: z.enum(['available', 'full', 'locked']).optional(),
  bookedCount: z.number().int().min(0).optional(),
});

export const adminGenerateSlotsSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startHour: z.number().int().min(0).max(23).default(10),
  endHour: z.number().int().min(1).max(24).default(20),
  maxCapacity: z.number().int().min(1).optional(),
});

export const adminCreateBookingSchema = z.object({
  userId: z.string().uuid(),
  timeSlotId: z.string().uuid(),
});

export const adminUpdateBookingSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'cancelled']).optional(),
  timeSlotId: z.string().uuid().optional(),
});

export const adminBookingListQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  venueId: z.string().uuid().optional(),
  status: z.enum(['pending', 'confirmed', 'cancelled']).optional(),
  search: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().uuid().optional(),
});

export const adminVenueListQuerySchema = z.object({
  search: z.string().max(200).optional(),
  active: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().uuid().optional(),
});

export const adminUpdateTournamentSchema = createTournamentSchema.partial().extend({
  phase: z.enum(['normal', 'knockout', 'completed']).optional(),
  currentRoundNumber: z.number().int().positive().optional(),
  initialPlayerCount: z.number().int().positive().optional(),
});

export const adminTournamentListQuerySchema = z.object({
  status: tournamentStatusSchema.optional(),
  phase: z.enum(['normal', 'knockout', 'completed']).optional(),
  search: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().uuid().optional(),
});

export const adminCreateRoundSchema = z.object({
  roundNumber: z.number().int().positive(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  status: z.enum(['active', 'closed']).optional(),
});

export const adminUpdateRoundSchema = z.object({
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  status: z.enum(['active', 'closed']).optional(),
});

export const adminCreateRegistrationSchema = z.object({
  userId: z.string().uuid(),
  bookingId: z.string().uuid().optional(),
});

export const adminUpdateParticipantSchema = z.object({
  status: z.enum(['active', 'eliminated', 'advanced', 'knockout', 'out']).optional(),
  wins: z.number().int().min(0).optional(),
  losses: z.number().int().min(0).optional(),
  buybackCount: z.number().int().min(0).optional(),
  roundNumber: z.number().int().positive().optional(),
  soloTarget: z.number().int().min(0).nullable().optional(),
  soloPlayedAt: z.string().datetime().nullable().optional(),
});

export const adminMatchListQuerySchema = z.object({
  view: z.enum(['ongoing', 'upcoming', 'past', 'all']).optional().default('all'),
  tournamentId: z.string().uuid().optional(),
  status: z.enum([
    'pending_confirmation',
    'confirmed',
    'in_progress',
    'completed',
    'cancelled',
    'expired',
  ]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().uuid().optional(),
});

export const adminCreateMatchSchema = z.object({
  player1Id: z.string().uuid(),
  player2Id: z.string().uuid(),
  tournamentId: z.string().uuid().optional().nullable(),
  venueId: z.string().uuid().optional().nullable(),
  timeSlotId: z.string().uuid().optional().nullable(),
  scheduledAt: z.string().datetime().optional().nullable(),
  roundNumber: z.number().int().positive().optional().nullable(),
  phase: z.enum(['normal', 'knockout']).optional().nullable(),
  bracketSlot: z.number().int().optional().nullable(),
  status: z.enum([
    'pending_confirmation',
    'confirmed',
    'in_progress',
    'completed',
    'cancelled',
    'expired',
  ]).optional(),
});

export const adminUpdateMatchSchema = z.object({
  player1Id: z.string().uuid().optional(),
  player2Id: z.string().uuid().optional(),
  venueId: z.string().uuid().optional().nullable(),
  timeSlotId: z.string().uuid().optional().nullable(),
  scheduledAt: z.string().datetime().optional().nullable(),
  status: z.enum([
    'pending_confirmation',
    'confirmed',
    'in_progress',
    'completed',
    'cancelled',
    'expired',
  ]).optional(),
  roundNumber: z.number().int().positive().optional().nullable(),
  phase: z.enum(['normal', 'knockout']).optional().nullable(),
  bracketSlot: z.number().int().optional().nullable(),
});

export const adminMatchResultSchema = z.object({
  player1Score: z.number().int().min(0).nullable().optional(),
  player2Score: z.number().int().min(0).nullable().optional(),
  winnerId: z.string().uuid().nullable().optional(),
  source: z.enum(['meta', 'manual']).optional(),
});

export const adminBuybackListQuerySchema = z.object({
  tournamentId: z.string().uuid().optional(),
  status: z.enum(['completed', 'pending', 'failed']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().uuid().optional(),
});

export const adminCreateBuybackSchema = z.object({
  userId: z.string().uuid(),
  tournamentId: z.string().uuid(),
  roundNumber: z.number().int().positive(),
  matchId: z.string().uuid().optional(),
  amountCents: z.number().int().min(0),
  fulfill: z.boolean().optional().default(true),
});

export const adminUpdateBuybackSchema = z.object({
  status: z.enum(['completed', 'pending', 'failed']).optional(),
});

export const adminNotificationListQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  type: z.string().max(50).optional(),
  status: z.enum(['pending', 'sent', 'failed']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().uuid().optional(),
});

export const adminCreateNotificationSchema = z.object({
  userId: z.string().uuid(),
  type: z.string().min(1).max(50),
  channel: z.enum(['in_app', 'email']).default('in_app'),
  payload: z.record(z.unknown()).default({}),
});

export const adminBroadcastNotificationSchema = z.object({
  type: z.string().min(1).max(50),
  channel: z.enum(['in_app', 'email']).default('in_app'),
  payload: z.record(z.unknown()).default({}),
  tournamentId: z.string().uuid().optional(),
  venueId: z.string().uuid().optional(),
});

export const adminAssignVenueAdminSchema = z.object({
  userId: z.string().uuid(),
});

export const adminAssignTournamentAdminSchema = z.object({
  userId: z.string().uuid(),
});

export type AdminAssignVenueAdminInput = z.infer<typeof adminAssignVenueAdminSchema>;
export type AdminAssignTournamentAdminInput = z.infer<typeof adminAssignTournamentAdminSchema>;

export const adminAuditListQuerySchema = z.object({
  entityType: z.string().max(50).optional(),
  entityId: z.string().max(100).optional(),
  actorId: z.string().uuid().optional(),
  action: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().uuid().optional(),
});

export type AdminListQuery = z.infer<typeof adminListQuerySchema>;
export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;
export type AdminUpdateVenueInput = z.infer<typeof adminUpdateVenueSchema>;
export type AdminUpdateSlotInput = z.infer<typeof adminUpdateSlotSchema>;
export type AdminGenerateSlotsInput = z.infer<typeof adminGenerateSlotsSchema>;
export type AdminCreateBookingInput = z.infer<typeof adminCreateBookingSchema>;
export type AdminUpdateBookingInput = z.infer<typeof adminUpdateBookingSchema>;
export type AdminBookingListQuery = z.infer<typeof adminBookingListQuerySchema>;
export type AdminVenueListQuery = z.infer<typeof adminVenueListQuerySchema>;
export type AdminUpdateTournamentInput = z.infer<typeof adminUpdateTournamentSchema>;
export type AdminTournamentListQuery = z.infer<typeof adminTournamentListQuerySchema>;
export type AdminCreateRoundInput = z.infer<typeof adminCreateRoundSchema>;
export type AdminUpdateRoundInput = z.infer<typeof adminUpdateRoundSchema>;
export type AdminCreateRegistrationInput = z.infer<typeof adminCreateRegistrationSchema>;
export type AdminUpdateParticipantInput = z.infer<typeof adminUpdateParticipantSchema>;
export type AdminMatchListQuery = z.infer<typeof adminMatchListQuerySchema>;
export type AdminCreateMatchInput = z.infer<typeof adminCreateMatchSchema>;
export type AdminUpdateMatchInput = z.infer<typeof adminUpdateMatchSchema>;
export type AdminMatchResultInput = z.infer<typeof adminMatchResultSchema>;
export type AdminCreateBuybackInput = z.infer<typeof adminCreateBuybackSchema>;
export type AdminUpdateBuybackInput = z.infer<typeof adminUpdateBuybackSchema>;
export type AdminBuybackListQuery = z.infer<typeof adminBuybackListQuerySchema>;
export type AdminNotificationListQuery = z.infer<typeof adminNotificationListQuerySchema>;
export type AdminCreateNotificationInput = z.infer<typeof adminCreateNotificationSchema>;
export type AdminBroadcastNotificationInput = z.infer<typeof adminBroadcastNotificationSchema>;
export type AdminAuditListQuery = z.infer<typeof adminAuditListQuerySchema>;
