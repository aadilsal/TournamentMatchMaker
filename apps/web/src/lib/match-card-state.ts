export type MatchCardState =
  | 'not_started'
  | 'bat_first'
  | 'chasing'
  | 'waiting_opponent'
  | 'resolving'
  | 'completed'
  | 'closed';

export interface MatchCardInput {
  status: string;
  myScore: number | null | undefined;
  opponentScore: number | null | undefined;
  /** Player the stored result says must chase, if any. */
  chasePlayerId?: string | null;
  myId?: string | null;
}

/** One state per card, so the header and body can never disagree. */
export function matchCardState(m: MatchCardInput): MatchCardState {
  if (m.status === 'completed') return 'completed';
  if (m.status === 'cancelled' || m.status === 'expired') return 'closed';
  const mine = m.myScore != null;
  const theirs = m.opponentScore != null;
  if (mine && theirs) return 'resolving';
  if (mine) return 'waiting_opponent';
  if (theirs || (m.chasePlayerId != null && m.chasePlayerId === m.myId)) return 'chasing';
  if (m.status === 'pending_confirmation') return 'not_started';
  return 'bat_first';
}

/** True when the player still has an innings to play. */
export const needsToPlay = (s: MatchCardState) => s === 'bat_first' || s === 'chasing';
