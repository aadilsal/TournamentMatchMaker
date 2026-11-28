// Public tournament page data: players, the live round and batting stats.
import type { BattingLeaderboards, BattingTotals, LeaderboardEntry } from './batting-stats.js';

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
  /** Ball-by-ball score while batting, when the headset sends balls. Additive. */
  live?: { runs: number; wickets: number; overs: string } | null;
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

/** One decided match in the player's recent form. */
export interface FormEntry {
  matchId: string;
  tournamentId: string | null;
  tournamentName: string | null;
  opponent: string;
  myScore: number | null;
  opponentScore: number | null;
  result: 'W' | 'L';
  decidedAt: string;
}

/** One innings on a profile, with the batting breakdown when the headset sent it. */
export interface ProfileMatch {
  matchId: string;
  tournamentId: string | null;
  tournamentName: string | null;
  opponent: string;
  myScore: number | null;
  opponentScore: number | null;
  /** Null while the match is still being played. */
  result: 'W' | 'L' | null;
  fours: number | null;
  sixes: number | null;
  wicketsLost: number | null;
  playedAt: string;
}

/** A tournament on a profile and how far the player got. */
export interface ProfileTournament {
  id: string;
  name: string;
  overs: number;
  startDate: string;
  finish: TournamentPlayerStatus;
  roundReached: number | null;
}

/** Public career page: stats, recent innings and tournament history. */
export interface PlayerProfileStats {
  username: string;
  /** Title shown beside the name, e.g. "Six Machine". */
  displayTitle?: string | null;
  stats: PlayerDashboard['stats'];
  recentMatches: ProfileMatch[];
  tournaments: ProfileTournament[];
}

/** All-time leaderboards across every tournament; bots left out. */
export interface GlobalLeaderboards {
  batting: BattingLeaderboards;
  topRated: LeaderboardEntry[];
}

/** The logged-in player's home: career numbers, recent form and tournaments to watch or join. */
export interface PlayerDashboard {
  /** Title shown beside the name. */
  displayTitle?: string | null;
  stats: BattingTotals & {
    matches: number;
    wins: number;
    losses: number;
    /** 0–100, null before the first decided match. */
    winRate: number | null;
    tournamentsPlayed: number;
    tournamentsWon: number;
    ratingPoints: number;
    skillTier: number;
    /** Points still needed for the next tier; null at the top tier. */
    nextTier: { tier: number; pointsNeeded: number } | null;
    /** Points are below the held tier's floor; the tier is kept anyway. */
    tierProtected?: boolean;
  };
  recentForm: FormEntry[];
  liveTournaments: Array<{ id: string; name: string; overs: number; roundNumber: number; playerCount: number }>;
  openTournaments: Array<{ id: string; name: string; overs: number; startDate: string; playerCount: number; maxPlayers: number | null }>;
}
