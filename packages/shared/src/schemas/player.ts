import { z } from 'zod';

export const updatePlayerSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/).optional(),
  country: z.string().max(100).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  hasVrHeadset: z.boolean().optional(),
  vrDeviceType: z.string().max(100).optional().nullable(),
  skillTier: z.number().int().min(1).max(5).optional(),
});

export type UpdatePlayerInput = z.infer<typeof updatePlayerSchema>;
