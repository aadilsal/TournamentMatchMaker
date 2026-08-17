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

export type MatchOutcome = 'player1_win' | 'player2_win' | 'rematch' | 'incomplete';

export function resolveMatchOutcome(
  player1Id: string,
  player2Id: string,
  player1Score: number,
  player2Score: number,
  chase: Pick<MatchResultExtended, 'chaseTarget' | 'chasePlayerId'>
): MatchOutcome {
  if (chase.chaseTarget != null && chase.chasePlayerId) {
    const chaserScore = chase.chasePlayerId === player1Id ? player1Score : player2Score;
    const setterId = chase.chasePlayerId === player1Id ? player2Id : player1Id;
    const setterScore = setterId === player1Id ? player1Score : player2Score;

    // Both comparisons read the same number. They used to disagree: the tie was
    // checked against the setter's score on the board, the win against
    // `chaseTarget`. Those are the same value only because pairing seeds the
    // setter's half *from* the target — let them drift by one correction and a
    // chaser could be handed the match with fewer runs than the opponent the
    // scoreline showed. The innings on the board decides; `chaseTarget` is the
    // copy of it the chaser was shown while batting.
    if (chaserScore === setterScore) return 'rematch';
    const chaserWon = chaserScore > setterScore;
    const chaserIsPlayer1 = chase.chasePlayerId === player1Id;
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
