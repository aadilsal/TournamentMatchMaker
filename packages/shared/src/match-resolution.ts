import type { MatchResultExtended } from './types.js';

export interface ChaseSetup {
  player1Target: number | null;
  player2Target: number | null;
  chaseTarget: number | null;
  chasePlayerId: string | null;
}

export interface SoloPlayerInfo {
  userId: string;
  target: number;
  playedAt: number;
}

/** Determine chase target when pairing — earlier solo timestamp sets the chase. */
export function resolveChaseOnPair(
  player1Id: string,
  player2Id: string,
  p1Solo: SoloPlayerInfo | null,
  p2Solo: SoloPlayerInfo | null
): ChaseSetup {
  const player1Target = p1Solo?.target ?? null;
  const player2Target = p2Solo?.target ?? null;

  if (p1Solo && p2Solo) {
    const earlier = p1Solo.playedAt <= p2Solo.playedAt ? p1Solo : p2Solo;
    const chaserId = earlier.userId === player1Id ? player2Id : player1Id;
    return {
      player1Target,
      player2Target,
      chaseTarget: earlier.target,
      chasePlayerId: chaserId,
    };
  }

  if (p1Solo) {
    return {
      player1Target,
      player2Target,
      chaseTarget: p1Solo.target,
      chasePlayerId: player2Id,
    };
  }

  if (p2Solo) {
    return {
      player1Target,
      player2Target,
      chaseTarget: p2Solo.target,
      chasePlayerId: player1Id,
    };
  }

  return {
    player1Target: null,
    player2Target: null,
    chaseTarget: null,
    chasePlayerId: null,
  };
}

/**
 * The scoreline a chase match starts with.
 *
 * The target-setter has already batted — their solo innings *is* the chase
 * target — so their score goes on the board the moment the pair is made. That
 * is what makes the format asynchronous: only the chaser still has an innings
 * to play, and the match resolves on their single submission.
 *
 * Leaving both scores null instead left the setter shown a "defend" screen
 * (`amChasing: false`, `amSettingTarget: false`) with nothing to submit, while
 * the backend went on waiting for a second innings from them that no client
 * would ever send — so the match hung until the round or slot expired.
 */
export function initialScoresForChase(
  player1Id: string,
  chase: Pick<ChaseSetup, 'chaseTarget' | 'chasePlayerId'>
): { player1Score: number | null; player2Score: number | null } {
  if (chase.chaseTarget == null || !chase.chasePlayerId) {
    return { player1Score: null, player2Score: null };
  }
  const setterIsPlayer1 = chase.chasePlayerId !== player1Id;
  return {
    player1Score: setterIsPlayer1 ? chase.chaseTarget : null,
    player2Score: setterIsPlayer1 ? null : chase.chaseTarget,
  };
}

/**
 * What to do with a match whose time ran out before both innings were in.
 *
 * A half-played match is not the same as an unplayed one. One player batted —
 * in a chase, the setter batted before the pair even existed — and expiring the
 * match throws that innings away, which is the whole reason a no-show cost the
 * player who actually turned up. Whoever put a score on the board takes it.
 *
 * Only a completely empty scoreline is genuinely abandoned.
 */
export type AbandonedMatchOutcome = 'player1_walkover' | 'player2_walkover' | 'abandoned';

export function resolveAbandonedMatch(
  player1Score: number | null | undefined,
  player2Score: number | null | undefined
): AbandonedMatchOutcome {
  const p1 = player1Score ?? null;
  const p2 = player2Score ?? null;
  if (p1 !== null && p2 === null) return 'player1_walkover';
  if (p2 !== null && p1 === null) return 'player2_walkover';
  // Both present is not this function's case — a complete scoreline resolves
  // through `resolveMatchOutcome` long before anything expires it.
  return 'abandoned';
}

/**
 * The number a chaser is shown, and must reach, to win.
 *
 * A chase is won by *beating* the innings on the board, so the runs required
 * are always one more than the setter made. Showing the setter's raw score
 * instead asked the chaser to "reach" a number that, on reaching, only tied.
 *
 * This is the display value. Resolution below still compares the two innings
 * directly — the target is derived from the setter's score, so the two can
 * never disagree about who won.
 */
export function chaseTargetFor(setterScore: number): number {
  return setterScore + 1;
}

export type MatchOutcome = 'player1_win' | 'player2_win' | 'rematch' | 'incomplete';

/**
 * Who won, given both innings.
 *
 * A level score is a tie, and a tie is replayed: the pair are re-queued and
 * play a *new* match. That does not conflict with one-innings-per-player — the
 * innings record is per match, so a fresh match gives both players a fresh
 * innings. What neither of them may ever do is bat twice in the *same* match.
 *
 * This must only ever be reached with both innings genuinely recorded. Calling
 * it against a half-filled scoreline would declare a tie between a real score
 * and a placeholder, and re-queue two players in the middle of a match one of
 * them was still batting. `submitScore` gates on the innings table for exactly
 * that reason.
 */
export function resolveMatchOutcome(
  player1Id: string,
  player2Id: string,
  player1Score: number,
  player2Score: number,
  chase: Pick<MatchResultExtended, 'chaseTarget' | 'chasePlayerId'>
): MatchOutcome {
  if (chase.chaseTarget != null && chase.chasePlayerId) {
    const chaserIsPlayer1 = chase.chasePlayerId === player1Id;
    const chaserScore = chaserIsPlayer1 ? player1Score : player2Score;
    const setterScore = chaserIsPlayer1 ? player2Score : player1Score;

    // The innings on the board decides. `chaseTarget` is the copy of it the
    // chaser was shown while batting, one run higher; comparing against the
    // score itself keeps the two from drifting apart under any later
    // correction to the stored target.
    if (chaserScore === setterScore) return 'rematch';
    const chaserWon = chaserScore > setterScore;
    return chaserWon === chaserIsPlayer1 ? 'player1_win' : 'player2_win';
  }

  if (player1Score === player2Score) return 'rematch';
  return player1Score > player2Score ? 'player1_win' : 'player2_win';
}

export function winnerIdFromOutcome(
  outcome: MatchOutcome,
  player1Id: string,
  player2Id: string
): string | null {
  if (outcome === 'player1_win') return player1Id;
  if (outcome === 'player2_win') return player2Id;
  return null;
}
