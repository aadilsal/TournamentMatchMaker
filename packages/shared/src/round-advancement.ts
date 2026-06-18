/** How many active players remain after a normal round closes */

export function playersToAdvance(activeCount: number): number {
  if (activeCount <= 16) return activeCount;
  return Math.max(16, Math.floor(activeCount / 2));
}

export function shouldStartKnockout(activeCount: number): boolean {
  return activeCount <= 16;
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
      return 'Round of 16';
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
