// Batting totals and leaderboards from innings rows; bots are left out by the caller.

export interface InningsRow {
  userId: string;
  username: string;
  score: number;
  /** Null when the headset did not send them (older innings, abandoned innings). */
  fours: number | null;
  sixes: number | null;
  wicketsLost: number | null;
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
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  value: number;
  innings: number;
}

export interface BattingLeaderboards {
  mostRuns: LeaderboardEntry[];
  mostSixes: LeaderboardEntry[];
  mostFours: LeaderboardEntry[];
  /** Plain total of wickets lost; only players whose innings reported wickets. */
  fewestWicketsLost: LeaderboardEntry[];
  highestInnings: LeaderboardEntry[];
}

export function battingTotals(rows: readonly InningsRow[]): BattingTotals {
  return {
    innings: rows.length,
    runs: rows.reduce((s, r) => s + r.score, 0),
    fours: rows.reduce((s, r) => s + (r.fours ?? 0), 0),
    sixes: rows.reduce((s, r) => s + (r.sixes ?? 0), 0),
    wicketsLost: rows.reduce((s, r) => s + (r.wicketsLost ?? 0), 0),
    highest: rows.length ? Math.max(...rows.map((r) => r.score)) : null,
    inningsWithStats: rows.filter((r) => r.fours != null || r.sixes != null).length,
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
}

export function battingLeaderboards(rows: readonly InningsRow[], size = 5): BattingLeaderboards {
  const byPlayer = new Map<string, PlayerTally>();
  for (const r of rows) {
    const p = byPlayer.get(r.userId) ?? {
      userId: r.userId, username: r.username, innings: 0, runs: 0, fours: 0, sixes: 0, wicketsLost: 0, wicketInnings: 0,
    };
    p.innings += 1;
    p.runs += r.score;
    p.fours += r.fours ?? 0;
    p.sixes += r.sixes ?? 0;
    if (r.wicketsLost != null) {
      p.wicketInnings += 1;
      p.wicketsLost += r.wicketsLost;
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

  return {
    mostRuns: top((p) => p.runs),
    mostSixes: top((p) => p.sixes),
    mostFours: top((p) => p.fours),
    fewestWicketsLost: players
      .filter((p) => p.wicketInnings > 0)
      .sort((a, b) => a.wicketsLost - b.wicketsLost || b.runs - a.runs || a.username.localeCompare(b.username))
      .slice(0, size)
      .map((p) => entry(p, p.wicketsLost)),
    highestInnings: [...rows]
      .sort((a, b) => b.score - a.score || a.username.localeCompare(b.username))
      .slice(0, size)
      .map((r) => ({ userId: r.userId, username: r.username, value: r.score, innings: 1 })),
  };
}
