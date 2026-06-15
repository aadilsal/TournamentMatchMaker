import { z } from 'zod';

export const matchStatusSchema = z.enum([
  'pending_confirmation',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
  'expired',
]);

export const declineMatchSchema = z.object({
  requeue: z.boolean().default(true),
});

export const submitScoreSchema = z.object({
  score: z.number().int().min(0).max(999),
});

export type DeclineMatchInput = z.infer<typeof declineMatchSchema>;
export type SubmitScoreInput = z.infer<typeof submitScoreSchema>;
