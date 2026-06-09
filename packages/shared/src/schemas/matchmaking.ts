import { z } from 'zod';

export const joinQueueSchema = z.object({
  tournamentId: z.string().uuid().optional(),
  preferredCity: z.string().min(1).max(100).optional(),
});

export type JoinQueueInput = z.infer<typeof joinQueueSchema>;
