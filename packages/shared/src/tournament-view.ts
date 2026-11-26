// Public tournament page data: players, the live round and batting stats.
import type { BattingLeaderboards, BattingTotals } from './batting-stats.js';

/** registered = before the start; in = still playing; out = knocked out; champion = won it. */
export type TournamentPlayerStatus = 'registered' | 'in' | 'out' | 'champion';

export interface TournamentPlayer {
  userId: string;
  username: string;
  skillTier: number;
  /** "Home" or the venue name. */
  playingAt: string | null;
  status: TournamentPlayerStatus;
  /** Last round reached (the round they went out in, when out). */
  roundReached: number | null;
  wins: number;
  losses: number;
}

/** to_play: nobody has batted; batting: someone is batting now; chasing: one score in, the other to bat. */
export type LiveMatchState = 'to_play' | 'batting' | 'chasing' | 'decided' | 'no_result';

export interface LiveMatchSide {
  username: string;
  isBot: boolean;
  /** Null until this side has batted. */
  score: number | null;
  /** Batting right now (started and still sending heartbeats). */
  batting: boolean;
}

export interface LiveMatch {
  id: string;
  state: LiveMatchState;
  player1: LiveMatchSide;
  player2: LiveMatchSide;
  /** Runs needed to win once one side has batted. */
  target: number | null;
  winner: string | null;
  /** Replayed after a tie. */
  tieReplay: boolean;
}

export interface TournamentLive {
  round: { number: number; label: string; closesAt: string | null; status: string } | null;
  matches: LiveMatch[];
}

export interface TournamentStats {
  totals: BattingTotals;
  leaderboards: BattingLeaderboards;
}
