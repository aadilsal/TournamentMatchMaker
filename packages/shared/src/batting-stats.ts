// Batting totals and leaderboards from innings rows; bots are left out by the caller.

/** Innings needed before a player can appear on the wickets board. */
export const WICKETS_MIN_INNINGS_TOURNAMENT = 3;
export const WICKETS_MIN_INNINGS_ALL_TIME = 5;

export interface InningsRow {
  userId: string;
  username: string;
  score: number;
  /** Null when the headset did not send them (older innings, abandoned innings). */
  fours: number | null;
  sixes: number | null;
  wicketsLost: number | null;
  /** Overs in this innings (the tournament's setting), so formats compare fairly. */
  overs: number;
}

export interface BattingTotals {
  innings: number;
  runs: number;
  fours: number;
  sixes: number;
  wicketsLost: number;
  highest: number | null;
  /** Innings that carried a 4s/6s breakdown, so totals can say how complete they are. */
  inningsWithStats: number;
  /** Innings that reported wickets, and the overs they covered. */
  wicketInnings: number;
  wicketOvers: number;
  /** Wickets lost per over batted; null until wickets were reported. */
  wicketsPerOver: number | null;
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  value: number;
  innings: number;
  /** Wickets board only: the totals behind the rate. */
  wickets?: number;
  overs?: number;
}

export interface BattingLeaderboards {
  mostRuns: LeaderboardEntry[];
  mostSixes: LeaderboardEntry[];
  mostFours: LeaderboardEntry[];
  /** Lowest wickets per over; only players with enough innings that reported wickets. */
  fewestWicketsPerOver: LeaderboardEntry[];
  highestInnings: LeaderboardEntry[];
}

const rate = (wickets: number, overs: number) => Math.round((wickets / overs) * 100) / 100;

export function battingTotals(rows: readonly InningsRow[]): BattingTotals {
  const withWickets = rows.filter((r) => r.wicketsLost != null);
  const wicketOvers = withWickets.reduce((s, r) => s + r.overs, 0);
  const wicketsLost = rows.reduce((s, r) => s + (r.wicketsLost ?? 0), 0);
  return {
    innings: rows.length,
    runs: rows.reduce((s, r) => s + r.score, 0),
    fours: rows.reduce((s, r) => s + (r.fours ?? 0), 0),
    sixes: rows.reduce((s, r) => s + (r.sixes ?? 0), 0),
    wicketsLost,
    highest: rows.length ? Math.max(...rows.map((r) => r.score)) : null,
    inningsWithStats: rows.filter((r) => r.fours != null || r.sixes != null).length,
    wicketInnings: withWickets.length,
    wicketOvers,
    wicketsPerOver: wicketOvers > 0 ? rate(wicketsLost, wicketOvers) : null,
  };
}

interface PlayerTally {
  userId: string;
  username: string;
  innings: number;
  runs: number;
  fours: number;
  sixes: number;
  wicketsLost: number;
  wicketInnings: number;
  wicketOvers: number;
}

export function battingLeaderboards(
  rows: readonly InningsRow[],
  size = 5,
  minWicketInnings = WICKETS_MIN_INNINGS_TOURNAMENT
): BattingLeaderboards {
  const byPlayer = new Map<string, PlayerTally>();
  for (const r of rows) {
    const p = byPlayer.get(r.userId) ?? {
      userId: r.userId, username: r.username, innings: 0, runs: 0, fours: 0, sixes: 0, wicketsLost: 0, wicketInnings: 0, wicketOvers: 0,
    };
    p.innings += 1;
    p.runs += r.score;
    p.fours += r.fours ?? 0;
    p.sixes += r.sixes ?? 0;
    if (r.wicketsLost != null) {
      p.wicketInnings += 1;
      p.wicketsLost += r.wicketsLost;
      p.wicketOvers += r.overs;
    }
    byPlayer.set(r.userId, p);
  }
  const players = [...byPlayer.values()];
  const entry = (p: PlayerTally, value: number): LeaderboardEntry => ({ userId: p.userId, username: p.username, value, innings: p.innings });
  // Higher is better; level totals go to the player who needed fewer innings.
  const top = (pick: (p: PlayerTally) => number) =>
    players
      .filter((p) => pick(p) > 0)
      .sort((a, b) => pick(b) - pick(a) || a.innings - b.innings || a.username.localeCompare(b.username))
      .slice(0, size)
      .map((p) => entry(p, pick(p)));

  // Lowest rate first; ties go to whoever batted more overs, then scored more runs.
  const perOver = (p: PlayerTally) => p.wicketsLost / p.wicketOvers;
  return {
    mostRuns: top((p) => p.runs),
    mostSixes: top((p) => p.sixes),
    mostFours: top((p) => p.fours),
    fewestWicketsPerOver: players
      .filter((p) => p.wicketInnings >= minWicketInnings && p.wicketOvers > 0)
      .sort((a, b) => perOver(a) - perOver(b) || b.wicketOvers - a.wicketOvers || b.runs - a.runs || a.username.localeCompare(b.username))
      .slice(0, size)
      .map((p) => ({ ...entry(p, rate(p.wicketsLost, p.wicketOvers)), wickets: p.wicketsLost, overs: p.wicketOvers })),
    highestInnings: [...rows]
      .sort((a, b) => b.score - a.score || a.username.localeCompare(b.username))
      .slice(0, size)
      .map((r) => ({ userId: r.userId, username: r.username, value: r.score, innings: 1 })),
  };
}
