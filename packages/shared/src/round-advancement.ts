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

/**
 * How many normal rounds a tournament schedules before the knockout.
 *
 * It falls out of the rules above rather than being configured. Closing round 1
 * advances `floor(N / 2)` of a field of N, which is exactly
 * `knockoutThreshold(N)` — so when round 2 closes `shouldStartKnockout` is
 * already true and the bracket takes over. Two rounds, whatever N is.
 *
 * Buybacks can push the field back above the threshold and buy a third normal
 * round, so treat this as the number always scheduled, not a maximum.
 */
export const SCHEDULED_NORMAL_ROUNDS = 2;

/**
 * The shortest tournament that can actually run its normal rounds.
 *
 * Rounds run back to back from the tournament start (each new round begins
 * where the last one ended), so the normal phase occupies
 * `SCHEDULED_NORMAL_ROUNDS × roundDurationDays`. A window shorter than that
 * leaves a round starting at or past the end date: the end-date sweep completes
 * the tournament and expires its matches, so the round can never be played.
 */
export function minTournamentDaysForRoundDuration(roundDurationDays: number): number {
  return roundDurationDays * SCHEDULED_NORMAL_ROUNDS;
}

export function playersToAdvance(activeCount: number, fieldSize: number): number {
  if (shouldStartKnockout(activeCount, fieldSize)) return activeCount;
  return Math.floor(activeCount / 2);
}

export function firstKnockoutMatchCount(playerCount: number): number {
  return Math.floor(playerCount / 2);
}

/**
 * The draw for a knockout round, given who is still standing.
 *
 * An odd field is the case that used to deadlock the bracket:
 * `firstKnockoutMatchCount(3)` is 1, so the third player was dropped from the
 * draw with no match and no path, and the slot above them waited forever for an
 * opponent nobody had scheduled. Here the odd player out takes a bye instead —
 * the best record gets it — and comes back into the draw next round, when the
 * field is even again.
 *
 * Pairs are listed in bracket-slot order.
 */
export function knockoutDraw(players: string[]): {
  roundNumber: number;
  pairs: Array<[string, string]>;
  bye: string | null;
} {
  const roundNumber =
    players.length > 8
      ? KNOCKOUT_ROUNDS.ro16
      : players.length > 4
        ? KNOCKOUT_ROUNDS.qf
        : players.length > 2
          ? KNOCKOUT_ROUNDS.sf
          : KNOCKOUT_ROUNDS.final;

  const odd = players.length % 2 === 1;
  const bye = odd ? (players[0] ?? null) : null;
  const drawn = odd ? players.slice(1) : players;

  const pairs: Array<[string, string]> = [];
  for (let i = 0; i + 1 < drawn.length; i += 2) {
    pairs.push([drawn[i], drawn[i + 1]]);
  }

  return { roundNumber, pairs, bye };
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
