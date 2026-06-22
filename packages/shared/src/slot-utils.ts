/** Returns true when the slot start time is in the past. */
export function isSlotStartPast(startTime: Date | string): boolean {
  return new Date(startTime).getTime() <= Date.now();
}

/** Returns true when the slot play window has ended. */
export function isSlotEnded(endTime: Date | string): boolean {
  return new Date(endTime).getTime() <= Date.now();
}

/** Pick the earlier of two booking slots by start_time. */
export function pickEarlierSlot<T extends { startTime: Date | string }>(
  a: T | null | undefined,
  b: T | null | undefined
): T | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return new Date(a.startTime).getTime() <= new Date(b.startTime).getTime() ? a : b;
}
