import { z } from 'zod';

export const slotListQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const createSlotsSchema = z.object({
  slots: z.array(
    z.object({
      startTime: z.string().datetime(),
      endTime: z.string().datetime(),
      maxCapacity: z.number().int().min(1),
    })
  ).min(1),
});

export type SlotListQuery = z.infer<typeof slotListQuerySchema>;
export type CreateSlotsInput = z.infer<typeof createSlotsSchema>;
