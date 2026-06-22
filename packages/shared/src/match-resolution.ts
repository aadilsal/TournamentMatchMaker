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

export type MatchOutcome = 'player1_win' | 'player2_win' | 'rematch' | 'incomplete';

export function resolveMatchOutcome(
  player1Id: string,
  player2Id: string,
  player1Score: number,
  player2Score: number,
  chase: Pick<MatchResultExtended, 'chaseTarget' | 'chasePlayerId'>
): MatchOutcome {
  if (chase.chaseTarget != null && chase.chasePlayerId) {
    const chaseTarget = chase.chaseTarget;
    const chaserScore = chase.chasePlayerId === player1Id ? player1Score : player2Score;
    const setterId = chase.chasePlayerId === player1Id ? player2Id : player1Id;
    const setterScore = setterId === player1Id ? player1Score : player2Score;

    if (chaserScore === setterScore) return 'rematch';
    if (chaserScore > chaseTarget) {
      return chase.chasePlayerId === player1Id ? 'player1_win' : 'player2_win';
    }
    return chase.chasePlayerId === player1Id ? 'player2_win' : 'player1_win';
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
