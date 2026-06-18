import { z } from 'zod';

export const buybackSchema = z.object({
  matchId: z.string().uuid().optional(),
});

export type BuybackInput = z.infer<typeof buybackSchema>;
