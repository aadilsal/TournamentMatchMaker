import { z } from 'zod';

export const MAX_SLOT_CAPACITY = 100;
export const MAX_SLOTS_PER_REQUEST = 200;

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** IANA zone the caller's calendar day is in; days are bucketed in it, not in UTC. */
export const timeZoneSchema = z.string().max(64).refine(isTimeZone, 'Unknown time zone');

export const slotListQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tz: timeZoneSchema.optional(),
});

const slotInputSchema = z
  .object({
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
    maxCapacity: z.number().int().min(1).max(MAX_SLOT_CAPACITY),
  })
  .refine((s) => Date.parse(s.endTime) > Date.parse(s.startTime), {
    message: 'Slot must end after it starts',
    path: ['endTime'],
  })
  .refine((s) => Date.parse(s.startTime) > Date.now(), {
    message: 'Slot must start in the future',
    path: ['startTime'],
  });

/** Index of the first slot that overlaps another in the list, or -1. */
export function findOverlappingSlot(slots: Array<{ startTime: string; endTime: string }>): number {
  const order = slots
    .map((s, i) => ({ i, start: Date.parse(s.startTime), end: Date.parse(s.endTime) }))
    .sort((a, b) => a.start - b.start);
  for (let k = 1; k < order.length; k++) {
    if (order[k]!.start < order[k - 1]!.end) return order[k]!.i;
  }
  return -1;
}

export const createSlotsSchema = z.object({
  slots: z
    .array(slotInputSchema)
    .min(1)
    .max(MAX_SLOTS_PER_REQUEST)
    .superRefine((slots, ctx) => {
      const i = findOverlappingSlot(slots);
      if (i >= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [i, 'startTime'],
          message: 'Slots in the same request must not overlap',
        });
      }
    }),
});

export type SlotListQuery = z.infer<typeof slotListQuerySchema>;
export type CreateSlotsInput = z.infer<typeof createSlotsSchema>;
