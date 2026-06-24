import { z } from 'zod';

export const tournamentStatusSchema = z.enum([
  'draft',
  'open',
  'closed',
  'in_progress',
  'completed',
]);

export const createTournamentSchema = z.object({
  name: z.string().min(1).max(200),
  game: z.string().min(1).max(100),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  status: tournamentStatusSchema.optional(),
  maxPlayers: z.number().int().positive().optional(),
  skillTier: z.number().int().min(1).max(5).optional(),
  buybackPriceCents: z.number().int().min(0).optional(),
  roundDurationMinutes: z.number().int().min(15).max(30 * 24 * 60).optional(),
});

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

export const enterTournamentSchema = z.object({
  venueId: z.string().uuid().optional(),
  timeSlotId: z.string().uuid().optional(),
});

export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;
export type TournamentListQuery = z.infer<typeof tournamentListQuerySchema>;
export type TournamentMatchesQuery = z.infer<typeof tournamentMatchesQuerySchema>;
export type RegisterTournamentInput = z.infer<typeof registerTournamentSchema>;
export type EnterTournamentInput = z.infer<typeof enterTournamentSchema>;
