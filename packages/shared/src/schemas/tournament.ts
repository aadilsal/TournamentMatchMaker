import { z } from 'zod';

export const tournamentFormatSchema = z.enum([
  'single_elimination',
  'double_elimination',
  'round_robin',
]);

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
  format: tournamentFormatSchema,
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  status: tournamentStatusSchema.optional(),
  maxPlayers: z.number().int().positive().optional(),
});

export const tournamentListQuerySchema = z.object({
  status: tournamentStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().uuid().optional(),
});

export const registerTournamentSchema = z.object({
  bookingId: z.string().uuid().optional(),
});

export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;
export type TournamentListQuery = z.infer<typeof tournamentListQuerySchema>;
export type RegisterTournamentInput = z.infer<typeof registerTournamentSchema>;
