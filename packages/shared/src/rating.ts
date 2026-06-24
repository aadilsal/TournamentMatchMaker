/** Global rating — single source of truth for API, worker, and web */

export const RATING_WIN_POINTS = 30;
export const RATING_LOSS_POINTS = -18;
export const DEFAULT_RATING_POINTS = 650;

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

export function tierLabel(tier: number): string {
  return `Tier ${tier}`;
}

export const SKILL_TIER_VALUES = [1, 2, 3, 4, 5] as const;

export const SKILL_TIER_OPTIONS = SKILL_TIER_VALUES.map((tier) => ({
  value: String(tier),
  label: tierLabel(tier),
}));
