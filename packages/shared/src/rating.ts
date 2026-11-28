/** Global rating — single source of truth for API, worker, and web */

export const RATING_WIN_POINTS = 30;
export const RATING_LOSS_POINTS = -18;
export const DEFAULT_RATING_POINTS = 300;

export const TIER_THRESHOLDS = [
  { tier: 1, minPoints: 0 },
  { tier: 2, minPoints: 500 },
  { tier: 3, minPoints: 800 },
  { tier: 4, minPoints: 1200 },
  { tier: 5, minPoints: 1700 },
] as const;

export function pointsToTier(points: number): number {
  let tier = 1;
  for (const t of TIER_THRESHOLDS) {
    if (points >= t.minPoints) tier = t.tier;
  }
  return tier;
}

export function applyMatchResult(currentPoints: number, won: boolean): number {
  return Math.max(0, currentPoints + (won ? RATING_WIN_POINTS : RATING_LOSS_POINTS));
}

/** A tier once reached is kept: losses lower points, never the tier. */
export function tierAfterResult(currentTier: number, newPoints: number): number {
  return Math.max(currentTier || 1, pointsToTier(newPoints));
}

/** Lowest points of a tier. */
export function tierFloor(tier: number): number {
  return TIER_THRESHOLDS.find((t) => t.tier === tier)?.minPoints ?? 0;
}

/** Next tier above the one held, with the points still needed; null at the top. */
export function nextTierFor(currentTier: number, points: number): { tier: number; pointsNeeded: number } | null {
  const next = TIER_THRESHOLDS.find((t) => t.tier === currentTier + 1);
  return next ? { tier: next.tier, pointsNeeded: Math.max(0, next.minPoints - points) } : null;
}

export function tierLabel(tier: number): string {
  return `Tier ${tier}`;
}

export const SKILL_TIER_VALUES = [1, 2, 3, 4, 5] as const;

export const SKILL_TIER_OPTIONS = SKILL_TIER_VALUES.map((tier) => ({
  value: String(tier),
  label: tierLabel(tier),
}));
