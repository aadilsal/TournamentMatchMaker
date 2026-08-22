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

export interface RoundWindow {
  roundNumber: number;
  startsAt: string | Date;
  endsAt: string | Date;
}

export interface RoundWindowViolation {
  /** Which end of the round is out of bounds, matching the form field name. */
  path: 'startsAt' | 'endsAt';
  /** The tournament boundary the round crossed. */
  limit: Date;
  message: string;
}

/**
 * Every round has to sit inside the tournament's own window.
 *
 * The two are edited from different places — rounds on the Rounds tab, the
 * window on the edit form — so either side can be moved out from under the
 * other, and nothing used to stop it. A round outside the window is not
 * cosmetic: the end-date sweep completes the tournament and expires every open
 * match the moment `end_date` passes, so a round hanging past the end date is
 * shut by the lifecycle before it can be played, and a round starting before
 * `start_date` is unreachable because the slot picker only offers slots inside
 * the round *and* inside the tournament.
 *
 * This is the single definition — the admin API enforces it on both sides of
 * the boundary and the form checks it up front, so the button and the API
 * cannot disagree.
 */
export function roundWindowViolation(
  round: Pick<RoundWindow, 'startsAt' | 'endsAt'>,
  tournament: { startDate: string | Date; endDate: string | Date }
): RoundWindowViolation | null {
  const roundStart = new Date(round.startsAt);
  const roundEnd = new Date(round.endsAt);
  const start = new Date(tournament.startDate);
  const end = new Date(tournament.endDate);

  if (roundStart.getTime() < start.getTime()) {
    return {
      path: 'startsAt',
      limit: start,
      message: `Round starts before the tournament does (${start.toISOString()}) — move the round later, or bring the tournament start date forward`,
    };
  }
  if (roundEnd.getTime() > end.getTime()) {
    return {
      path: 'endsAt',
      limit: end,
      message: `Round ends after the tournament does (${end.toISOString()}) — shorten the round, or push the tournament end date back`,
    };
  }
  return null;
}

/**
 * The reverse check, for an edit that moves the tournament's own window: every
 * round that would be left outside it, so the error can name them.
 */
export function roundsOutsideWindow(
  rounds: RoundWindow[],
  tournament: { startDate: string | Date; endDate: string | Date }
): Array<{ round: RoundWindow; violation: RoundWindowViolation }> {
  return rounds.flatMap((round) => {
    const violation = roundWindowViolation(round, tournament);
    return violation ? [{ round, violation }] : [];
  });
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
