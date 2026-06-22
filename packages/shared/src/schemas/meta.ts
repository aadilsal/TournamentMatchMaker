import { z } from 'zod';

export const metaSubmitScoreSchema = z.object({
  userId: z.string().uuid(),
  score: z.number().int().min(0).max(999),
});

export const metaSoloTargetSchema = z.object({
  userId: z.string().uuid(),
  tournamentId: z.string().uuid(),
  target: z.number().int().min(0).max(999),
});

export const metaCurrentMatchQuerySchema = z.object({
  userId: z.string().uuid(),
});

export type MetaSubmitScoreInput = z.infer<typeof metaSubmitScoreSchema>;
export type MetaSoloTargetInput = z.infer<typeof metaSoloTargetSchema>;
