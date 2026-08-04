import { z } from 'zod';

export const tournamentStatusSchema = z.enum([
  'draft',
  'open',
  'closed',
  'in_progress',
  'completed',
]);

/**
 * The lifecycle runs off these four timestamps, so their ordering has to hold
 * or a tournament can reach a state it cannot leave — registration closing
 * after play starts, or an end date before the first round could finish.
 */
export const TOURNAMENT_WINDOW_RULES = [
  {
    path: 'registrationClosesAt',
    message: 'Registration must close after it opens',
    valid: (o: TournamentWindow) =>
      !o.registrationOpensAt || !o.registrationClosesAt || o.registrationOpensAt < o.registrationClosesAt,
  },
  {
    path: 'registrationClosesAt',
    message: 'Registration must close on or before the start date',
    valid: (o: TournamentWindow) =>
      !o.registrationClosesAt || !o.startDate || o.registrationClosesAt <= o.startDate,
  },
  {
    path: 'endDate',
    message: 'End date must be after the start date',
    valid: (o: TournamentWindow) => !o.startDate || !o.endDate || o.startDate < o.endDate,
  },
] as const;

export interface TournamentWindow {
  registrationOpensAt?: string | null;
  registrationClosesAt?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export function applyTournamentWindowRules<T extends z.ZodTypeAny>(schema: T) {
  return TOURNAMENT_WINDOW_RULES.reduce(
    (acc, rule) =>
      acc.refine((o: TournamentWindow) => rule.valid(o), {
        path: [rule.path],
        message: rule.message,
      }),
    schema as unknown as z.ZodEffects<z.ZodTypeAny>
  );
}

/**
 * The plain object, un-refined, so callers that need `.partial()` or `.extend()`
 * can build on it and re-apply the window rules themselves.
 */
export const tournamentFieldsSchema = z.object({
  name: z.string().min(1).max(200),
  game: z.string().min(1).max(100),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  registrationOpensAt: z.string().datetime().optional(),
  registrationClosesAt: z.string().datetime().optional(),
  status: tournamentStatusSchema.optional(),
  maxPlayers: z.number().int().positive().optional(),
  skillTier: z.number().int().min(1).max(5).optional(),
  buybackPriceCents: z.number().int().min(0).optional(),
  roundDurationMinutes: z.number().int().min(15).max(30 * 24 * 60).optional(),
});

export const createTournamentSchema = applyTournamentWindowRules(tournamentFieldsSchema);

export const tournamentListQuerySchema = z.object({
  status: tournamentStatusSchema.optional(),
  tier: z.coerce.number().int().min(1).max(5).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().uuid().optional(),
});

export const tournamentMatchesQuerySchema = z.object({
  round: z.coerce.number().int().positive().optional(),
  phase: z.enum(['normal', 'knockout']).optional(),
});

export const registerTournamentSchema = z.object({
  bookingId: z.string().uuid().optional(),
});

/**
 * `timeSlotId` is optional at the schema level only so a returning player can
 * re-enter a later round on their previous slot; the service rejects an entry
 * that resolves to no slot at all. VR players omit `venueId` — they pick a play
 * window, not a seat.
 */
export const enterTournamentSchema = z.object({
  venueId: z.string().uuid().optional(),
  timeSlotId: z.string().uuid().optional(),
});

export const tournamentSlotOptionsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  venueId: z.string().uuid().optional(),
});

export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;
export type TournamentListQuery = z.infer<typeof tournamentListQuerySchema>;
export type TournamentMatchesQuery = z.infer<typeof tournamentMatchesQuerySchema>;
export type RegisterTournamentInput = z.infer<typeof registerTournamentSchema>;
export type EnterTournamentInput = z.infer<typeof enterTournamentSchema>;
export type TournamentSlotOptionsQuery = z.infer<typeof tournamentSlotOptionsQuerySchema>;
