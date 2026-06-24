/** Returns true when the slot start time is in the past. */
export function isSlotStartPast(startTime: Date | string): boolean {
  return new Date(startTime).getTime() <= Date.now();
}

/** Returns true when a slot fits entirely inside a booking window (e.g. tournament round). */
export function isSlotWithinWindow(
  slotStart: Date | string,
  slotEnd: Date | string,
  windowStart: Date | string,
  windowEnd: Date | string
): boolean {
  const start = new Date(slotStart).getTime();
  const end = new Date(slotEnd).getTime();
  const wStart = new Date(windowStart).getTime();
  const wEnd = new Date(windowEnd).getTime();
  return start >= wStart && end <= wEnd;
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
