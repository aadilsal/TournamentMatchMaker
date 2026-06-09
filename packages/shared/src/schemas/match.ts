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

export type DeclineMatchInput = z.infer<typeof declineMatchSchema>;
