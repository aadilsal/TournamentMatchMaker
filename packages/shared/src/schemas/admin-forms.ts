import { z } from 'zod';
import {
  adminCreateBookingSchema,
  adminCreateBuybackSchema,
  adminCreateMatchSchema,
  adminCreateUserSchema,
  adminResetPasswordSchema,
  userRoleSchema,
} from './admin.js';
import { createVenueSchema } from './venue.js';
import { tournamentStatusSchema } from './tournament.js';
import {
  isValidRoundDurationMinutes,
  roundDurationToMinutes,
  type RoundDurationUnit,
} from '../round-duration.js';

export type FieldErrors = Record<string, string>;

export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_form');
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

export function validateAdminForm<T>(
  schema: z.ZodType<T>,
  data: unknown
): { ok: true; data: T } | { ok: false; errors: FieldErrors } {
  const result = schema.safeParse(data);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, errors: zodFieldErrors(result.error) };
}

const skillTierString = z
  .string()
  .min(1, 'Skill tier is required')
  .refine((v: string) => {
    const n = parseInt(v, 10);
    return Number.isInteger(n) && n >= 1 && n <= 5;
  }, 'Skill tier must be between 1 and 5');

const positiveIntString = (label: string) =>
  z.string().refine((v: string) => {
    if (!v.trim()) return true;
    const n = parseInt(v, 10);
    return Number.isInteger(n) && n >= 1;
  }, `${label} must be a positive whole number`);

const nonNegativeIntString = (label: string) =>
  z
    .string()
    .min(1, `${label} is required`)
    .refine((v: string) => {
      const n = parseInt(v, 10);
      return Number.isInteger(n) && n >= 0;
    }, `${label} must be 0 or greater`);

function parseDateTimeLocal(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const adminUserFormSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(50)
    .regex(/^[a-zA-Z0-9_]+$/, 'Use letters, numbers, and underscores only'),
  country: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  role: userRoleSchema,
  skillTier: skillTierString,
  hasVrHeadset: z.boolean(),
});

export type AdminUserFormInput = z.infer<typeof adminUserFormSchema>;

export function toAdminCreateUserInput(form: AdminUserFormInput) {
  return adminCreateUserSchema.parse({
    email: form.email,
    password: form.password,
    username: form.username,
    country: form.country?.trim() || null,
    city: form.city?.trim() || null,
    role: form.role,
    skillTier: parseInt(form.skillTier, 10),
    hasVrHeadset: form.hasVrHeadset,
  });
}

const roundDurationUnitSchema = z.enum(['minutes', 'hours', 'days']);

const roundDurationValueString = z
  .string()
  .min(1, 'Round duration is required')
  .refine((v: string) => {
    const n = parseInt(v, 10);
    return Number.isInteger(n) && n >= 1;
  }, 'Enter a whole number of at least 1');

export const adminTournamentFormSchema = z
  .object({
    name: z.string().min(1, 'Name is required').max(200, 'Name is too long'),
    game: z.string().min(1, 'Game is required').max(100, 'Game name is too long'),
    startDate: z.string().min(1, 'Start date is required'),
    endDate: z.string().min(1, 'End date is required'),
    registrationOpensAt: z.string().min(1, 'Registration open date is required'),
    registrationClosesAt: z.string().min(1, 'Registration close date is required'),
    status: tournamentStatusSchema,
    maxPlayers: positiveIntString('Max players'),
    skillTier: skillTierString,
    buybackPriceCents: nonNegativeIntString('Buyback price'),
    roundDurationValue: roundDurationValueString,
    roundDurationUnit: roundDurationUnitSchema,
  })
  .superRefine((data, ctx) => {
    const start = parseDateTimeLocal(data.startDate);
    const end = parseDateTimeLocal(data.endDate);
    if (!start) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['startDate'], message: 'Invalid start date' });
    }
    if (!end) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'Invalid end date' });
    }
    if (start && end && end <= start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'End date must be after start date',
      });
    }

    // The lifecycle runs off these four timestamps in order, so a window that
    // opens after it closes, or closes after play has begun, would leave the
    // tournament in a state it could never advance out of.
    const regOpens = parseDateTimeLocal(data.registrationOpensAt);
    const regCloses = parseDateTimeLocal(data.registrationClosesAt);
    if (!regOpens) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['registrationOpensAt'], message: 'Invalid date' });
    }
    if (!regCloses) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['registrationClosesAt'], message: 'Invalid date' });
    }
    if (regOpens && regCloses && regCloses <= regOpens) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['registrationClosesAt'],
        message: 'Registration must close after it opens',
      });
    }
    if (regCloses && start && regCloses > start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['registrationClosesAt'],
        message: 'Registration must close on or before the start date',
      });
    }

    const value = parseInt(data.roundDurationValue, 10);
    const minutes = roundDurationToMinutes(value, data.roundDurationUnit as RoundDurationUnit);
    if (!isValidRoundDurationMinutes(minutes)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['roundDurationValue'],
        message: 'Round duration must be between 15 minutes and 30 days',
      });
    }
  });

export type AdminTournamentFormInput = z.infer<typeof adminTournamentFormSchema>;

export function toTournamentApiBody(form: AdminTournamentFormInput) {
  return {
    name: form.name,
    game: form.game,
    startDate: new Date(form.startDate).toISOString(),
    endDate: new Date(form.endDate).toISOString(),
    registrationOpensAt: new Date(form.registrationOpensAt).toISOString(),
    registrationClosesAt: new Date(form.registrationClosesAt).toISOString(),
    status: form.status,
    maxPlayers: form.maxPlayers.trim() ? parseInt(form.maxPlayers, 10) : undefined,
    skillTier: parseInt(form.skillTier, 10),
    buybackPriceCents: parseInt(form.buybackPriceCents, 10),
    roundDurationMinutes: roundDurationToMinutes(
      parseInt(form.roundDurationValue, 10),
      form.roundDurationUnit
    ),
  };
}

export const adminVenueFormSchema = z
  .object({
    name: z.string().min(1, 'Name is required').max(255, 'Name is too long'),
    address: z.string().min(1, 'Address is required'),
    city: z.string().min(1, 'City is required').max(100),
    country: z.string().min(1, 'Country is required').max(100),
    latitude: z.string().min(1, 'Select a city to resolve coordinates'),
    longitude: z.string().min(1, 'Select a city to resolve coordinates'),
    capacity: z
      .string()
      .min(1, 'Capacity is required')
      .refine((v: string) => {
        const n = parseInt(v, 10);
        return Number.isInteger(n) && n >= 1;
      }, 'Capacity must be at least 1'),
    active: z.boolean(),
  })
  .superRefine((data, ctx) => {
    const lat = parseFloat(data.latitude);
    const lng = parseFloat(data.longitude);
    if (Number.isNaN(lat) || lat < -90 || lat > 90) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['latitude'], message: 'Latitude must be between -90 and 90' });
    }
    if (Number.isNaN(lng) || lng < -180 || lng > 180) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['longitude'], message: 'Longitude must be between -180 and 180' });
    }
  });

export type AdminVenueFormInput = z.infer<typeof adminVenueFormSchema>;

export function toVenueApiBody(form: AdminVenueFormInput) {
  return createVenueSchema.parse({
    name: form.name,
    address: form.address,
    city: form.city,
    country: form.country,
    latitude: parseFloat(form.latitude),
    longitude: parseFloat(form.longitude),
    capacity: parseInt(form.capacity, 10),
    active: form.active,
  });
}

/**
 * Booking composer. Uses its own field messages instead of the API schema's bare
 * `.uuid()` so an empty form says "Select a player", not "Invalid uuid".
 */
export const adminBookingFormSchema = z.object({
  userId: z.string().uuid('Select a player'),
  venueId: z.string().uuid('Select a venue'),
  timeSlotId: z.string().uuid('Select a time slot'),
});

export type AdminBookingFormInput = z.infer<typeof adminBookingFormSchema>;

export function toAdminBookingInput(form: AdminBookingFormInput) {
  return adminCreateBookingSchema.parse({
    userId: form.userId,
    timeSlotId: form.timeSlotId,
  });
}

export const adminMatchFormSchema = z
  .object({
    player1Id: z.string().uuid('Select player 1'),
    player2Id: z.string().uuid('Select player 2'),
    tournamentId: z.string().optional(),
    venueId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.player1Id === data.player2Id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['player2Id'],
        message: 'Players must be different',
      });
    }
    if (data.tournamentId && !z.string().uuid().safeParse(data.tournamentId).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tournamentId'],
        message: 'Invalid tournament',
      });
    }
    if (data.venueId && !z.string().uuid().safeParse(data.venueId).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['venueId'],
        message: 'Invalid venue',
      });
    }
  });

export type AdminMatchFormInput = z.infer<typeof adminMatchFormSchema>;

export function toAdminMatchInput(form: {
  player1Id: string;
  player2Id: string;
  tournamentId: string;
  venueId: string;
}) {
  return adminCreateMatchSchema.parse({
    player1Id: form.player1Id,
    player2Id: form.player2Id,
    tournamentId: form.tournamentId || null,
    venueId: form.venueId || null,
    status: 'pending_confirmation',
  });
}

export const adminBuybackFormSchema = z.object({
  userId: z.string().uuid('Select a player'),
  tournamentId: z.string().uuid('Select a tournament'),
  roundNumber: z
    .string()
    .min(1, 'Round is required')
    .refine((v: string) => {
      const n = parseInt(v, 10);
      return Number.isInteger(n) && n >= 1;
    }, 'Round must be at least 1'),
  amountDollars: z
    .string()
    .min(1, 'Amount is required')
    .refine((v: string) => {
      const n = parseFloat(v);
      return !Number.isNaN(n) && n >= 0;
    }, 'Amount must be 0 or greater'),
});

export type AdminBuybackFormInput = z.infer<typeof adminBuybackFormSchema>;

export function toAdminBuybackInput(form: AdminBuybackFormInput) {
  return adminCreateBuybackSchema.parse({
    userId: form.userId,
    tournamentId: form.tournamentId,
    roundNumber: parseInt(form.roundNumber, 10),
    amountCents: Math.round(parseFloat(form.amountDollars) * 100),
  });
}

export const adminRatingFormSchema = z.object({
  ratingPoints: z
    .string()
    .min(1, 'Rating is required')
    .refine((v: string) => {
      const n = parseInt(v, 10);
      return Number.isInteger(n) && n >= 0;
    }, 'Rating must be a non-negative whole number')
    .refine((v: string) => parseInt(v, 10) <= 5000, 'Rating cannot exceed 5000'),
});

export type AdminRatingFormInput = z.infer<typeof adminRatingFormSchema>;

export const adminPasswordFormSchema = adminResetPasswordSchema;

/* -------------------------------------------------------------------------- */
/* Inline admin forms                                                          */
/* -------------------------------------------------------------------------- */

const scoreString = (label: string) =>
  z
    .string()
    .min(1, `${label} score is required`)
    .refine((v: string) => {
      const n = parseInt(v, 10);
      return Number.isInteger(n) && n >= 0;
    }, `${label} score must be 0 or greater`)
    .refine((v: string) => parseInt(v, 10) <= 9999, `${label} score is unrealistically high`);

/** Manual score override on the admin match detail screen. */
export const adminScoreOverrideSchema = z.object({
  player1Score: scoreString('Player 1'),
  player2Score: scoreString('Player 2'),
});

export type AdminScoreOverrideInput = z.infer<typeof adminScoreOverrideSchema>;

/**
 * Types an admin may author in the broadcast composer. Deliberately narrow —
 * system events below are emitted by the backend, never hand-sent.
 */
export const NOTIFICATION_TYPE_OPTIONS = [
  { value: 'announcement', label: 'Announcement' },
  { value: 'tournament_update', label: 'Tournament update' },
  { value: 'match_reminder', label: 'Match reminder' },
  { value: 'system_maintenance', label: 'System maintenance' },
] as const;

export const notificationTypeSchema = z.enum([
  'announcement',
  'tournament_update',
  'match_reminder',
  'system_maintenance',
]);

/**
 * Types the notifications list can actually contain: the admin-authored ones
 * above plus every type the API/worker emits. Filtering by a type the system
 * never produces would silently return an empty table.
 */
export const NOTIFICATION_FILTER_TYPE_OPTIONS = [
  ...NOTIFICATION_TYPE_OPTIONS,
  { value: 'match_found', label: 'Match found' },
  { value: 'match_confirmed', label: 'Match confirmed' },
  { value: 'match_declined', label: 'Match declined' },
  { value: 'match_expired', label: 'Match expired' },
  { value: 'match_won', label: 'Match won' },
  { value: 'match_lost', label: 'Match lost' },
  { value: 'slot_selection_required', label: 'Slot selection required' },
  { value: 'rematch_required', label: 'Rematch required' },
  { value: 'opponent_withdrew_requeued', label: 'Opponent withdrew' },
  { value: 'tournament_registered', label: 'Tournament registered' },
  { value: 'buyback_completed', label: 'Buyback completed' },
  { value: 'admin_test', label: 'Admin test' },
] as const;

/** Broadcast composer on the admin notifications screen. */
export const adminBroadcastFormSchema = z.object({
  type: notificationTypeSchema,
  message: z
    .string()
    .trim()
    .min(3, 'Message must be at least 3 characters')
    .max(500, 'Message must be 500 characters or fewer'),
});

export type AdminBroadcastFormInput = z.infer<typeof adminBroadcastFormSchema>;

/** Max span a single slot-generation run may cover, to avoid runaway inserts. */
export const MAX_SLOT_GENERATION_DAYS = 31;

function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Slot generation on the admin venue detail screen. */
export const adminSlotGenerationFormSchema = z
  .object({
    startDate: z.string().min(1, 'Start date is required'),
    endDate: z.string().min(1, 'End date is required'),
    registrationOpensAt: z.string().min(1, 'Registration open date is required'),
    registrationClosesAt: z.string().min(1, 'Registration close date is required'),
  })
  .superRefine((data, ctx) => {
    const start = parseDateOnly(data.startDate);
    const end = parseDateOnly(data.endDate);

    if (!start) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['startDate'], message: 'Invalid start date' });
    }
    if (!end) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'Invalid end date' });
    }
    if (!start || !end) return;

    if (end < start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'End date must be on or after the start date',
      });
      return;
    }

    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    if (days > MAX_SLOT_GENERATION_DAYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: `Generate at most ${MAX_SLOT_GENERATION_DAYS} days at a time (selected ${days})`,
      });
    }
  });

export type AdminSlotGenerationFormInput = z.infer<typeof adminSlotGenerationFormSchema>;

export const PARTICIPANT_STATUS_OPTIONS = [
  {
    value: 'active',
    label: 'Active',
    help: 'Still in the tournament and eligible for pairing in the current round.',
  },
  {
    value: 'advanced',
    label: 'Advanced',
    help: 'Won their round and is waiting to be paired in the next round.',
  },
  {
    value: 'eliminated',
    label: 'Eliminated',
    help: 'Knocked out of the normal rounds. Can still buy back while the round is open.',
  },
  {
    value: 'knockout',
    label: 'Knockout',
    help: 'Promoted into the knockout bracket. Only set this during the knockout phase.',
  },
  {
    value: 'out',
    label: 'Out',
    help: 'Permanently removed from the bracket. Cannot buy back or be paired again.',
  },
] as const;

export const participantStatusSchema = z.enum([
  'active',
  'eliminated',
  'advanced',
  'knockout',
  'out',
]);

export const adminParticipantFormSchema = z.object({
  status: participantStatusSchema,
  roundNumber: z
    .string()
    .min(1, 'Round is required')
    .refine((v: string) => {
      const n = parseInt(v, 10);
      return Number.isInteger(n) && n >= 1;
    }, 'Round must be a whole number of at least 1'),
});

export type AdminParticipantFormInput = z.infer<typeof adminParticipantFormSchema>;
