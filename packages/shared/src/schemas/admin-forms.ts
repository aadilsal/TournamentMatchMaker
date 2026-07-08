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

export const adminBookingFormSchema = adminCreateBookingSchema;

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
    }, 'Rating must be a non-negative whole number'),
});

export type AdminRatingFormInput = z.infer<typeof adminRatingFormSchema>;

export const adminPasswordFormSchema = adminResetPasswordSchema;
