// Overs per innings: set per tournament, the same for every match in every round.
export const MIN_OVERS = 1;
export const MAX_OVERS = 20;
export const DEFAULT_OVERS = 1;
export const OVERS_PRESETS = [1, 5, 10, 20] as const;
export const BALLS_PER_OVER = 6;

/** Clamp anything stored or sent to a legal overs count (old rows read as 1). */
export function normalizeOvers(overs: unknown): number {
  const n = Number(overs);
  if (!Number.isInteger(n)) return DEFAULT_OVERS;
  return Math.min(MAX_OVERS, Math.max(MIN_OVERS, n));
}

export function ballsPerInnings(overs: number): number {
  return normalizeOvers(overs) * BALLS_PER_OVER;
}

/** "1 over a side", "5 overs a side". */
export function oversLabel(overs: number): string {
  const n = normalizeOvers(overs);
  return `${n} over${n === 1 ? '' : 's'} a side`;
}

/** Re-express a score made over `fromOvers` at the same run rate over `toOvers`. */
export function scaleScoreToOvers(score: number, fromOvers: number, toOvers: number): number {
  return Math.round((score / normalizeOvers(fromOvers)) * normalizeOvers(toOvers));
}
