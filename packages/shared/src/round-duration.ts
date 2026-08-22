/**
 * Rounds are configured in whole days only. Anything shorter than a day cannot
 * contain a venue time slot (slots are hour-long windows on the hour), so a
 * sub-day round leaves players with no pickable slot at all.
 */
export const MINUTES_PER_DAY = 24 * 60;

export const MIN_ROUND_DURATION_DAYS = 1;
export const MAX_ROUND_DURATION_DAYS = 30;

export const MIN_ROUND_DURATION_MINUTES = MIN_ROUND_DURATION_DAYS * MINUTES_PER_DAY;
export const MAX_ROUND_DURATION_MINUTES = MAX_ROUND_DURATION_DAYS * MINUTES_PER_DAY;

export function roundDurationDaysToMinutes(days: number): number {
  return days * MINUTES_PER_DAY;
}

/**
 * Days to show for a stored duration. Legacy tournaments may hold sub-day or
 * part-day values, so round up — the admin sees the next whole day rather than
 * a zero, and re-saving lengthens the round instead of silently shrinking it.
 */
export function minutesToRoundDurationDays(minutes: number): string {
  const days = Math.ceil(minutes / MINUTES_PER_DAY);
  return String(Math.min(Math.max(days, MIN_ROUND_DURATION_DAYS), MAX_ROUND_DURATION_DAYS));
}

export function isValidRoundDurationDays(days: number): boolean {
  return (
    Number.isInteger(days) && days >= MIN_ROUND_DURATION_DAYS && days <= MAX_ROUND_DURATION_DAYS
  );
}
