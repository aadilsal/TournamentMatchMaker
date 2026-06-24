/** How many active players remain after a normal round closes */

export function knockoutThreshold(fieldSize: number): number {
  if (fieldSize <= 1) return 1;
  return Math.floor(fieldSize / 2);
}

export function resolveFieldSize(initialPlayerCount: number | null | undefined, activeCount: number): number {
  if (initialPlayerCount && initialPlayerCount > 0) return initialPlayerCount;
  return Math.max(activeCount, 1);
}

export function shouldStartKnockout(activeCount: number, fieldSize: number): boolean {
  return activeCount <= knockoutThreshold(fieldSize);
}

export function playersToAdvance(activeCount: number, fieldSize: number): number {
  if (shouldStartKnockout(activeCount, fieldSize)) return activeCount;
  return Math.floor(activeCount / 2);
}

export function firstKnockoutMatchCount(playerCount: number): number {
  return Math.floor(playerCount / 2);
}

/** Knockout round numbers for bracket display */
export const KNOCKOUT_ROUNDS = {
  ro16: 100,
  qf: 101,
  sf: 102,
  final: 103,
} as const;

export function knockoutRoundLabel(roundNumber: number): string {
  switch (roundNumber) {
    case KNOCKOUT_ROUNDS.ro16:
      return 'Knockout';
    case KNOCKOUT_ROUNDS.qf:
      return 'Quarter-finals';
    case KNOCKOUT_ROUNDS.sf:
      return 'Semi-finals';
    case KNOCKOUT_ROUNDS.final:
      return 'Final';
    default:
      return `Round ${roundNumber}`;
  }
}
