import { BALLS_PER_OVER } from './overs.js';

/** One ball as fans see it. */
export interface LiveBall {
  seq: number;
  /** "2.3" — over 3, ball 3. */
  label: string;
  runs: number;
  wicket: boolean;
  totalRuns: number;
  wicketsLost: number;
  at: string;
}

/** One batter's innings in a live match. */
export interface LiveInnings {
  userId: string;
  username: string;
  state: 'waiting' | 'batting' | 'done';
  runs: number;
  wickets: number;
  legalBalls: number;
  /** "2.3" overs bowled. */
  overs: string;
  balls: LiveBall[];
  /** Runs to win; set only for the chasing innings. */
  target: number | null;
}

/** Everything the public live match page shows. */
export interface LiveMatchView {
  matchId: string;
  tournamentId: string | null;
  tournamentName: string | null;
  roundLabel: string | null;
  overs: number;
  ballsPerInnings: number;
  status: 'upcoming' | 'live' | 'finished';
  /** Batting order: first innings, then the chase. */
  innings: LiveInnings[];
  /** Needed to win while the chase is on. */
  needed: { runs: number; balls: number } | null;
  winnerId: string | null;
  /** One-line summary, e.g. "hamza needs 12 off 9". */
  headline: string;
}

/** Socket payload on the public `/live` namespace, event `live:ball`. */
export interface LiveBallEvent {
  matchId: string;
  tournamentId: string | null;
  batterId: string;
  batter: string;
  ball: LiveBall;
  needed: { runs: number; balls: number } | null;
}

/** Socket payload on `/live`, event `live:innings`: an innings started or finished. */
export interface LiveInningsEvent {
  matchId: string;
  tournamentId: string | null;
  batterId: string;
  state: 'batting' | 'done';
}

/** "2.3" for 15 legal balls. */
export function oversText(legalBalls: number): string {
  return `${Math.floor(legalBalls / BALLS_PER_OVER)}.${legalBalls % BALLS_PER_OVER}`;
}

/** Ball label for a ball number: ball 1 is "0.1", ball 6 is "0.6", ball 7 is "1.1". */
export function ballLabel(seq: number): string {
  const over = Math.floor((seq - 1) / BALLS_PER_OVER);
  return `${over}.${((seq - 1) % BALLS_PER_OVER) + 1}`;
}

/** Short commentary line for a ball. */
export function commentaryFor(ball: Pick<LiveBall, 'runs' | 'wicket' | 'label'>, batter: string): string {
  if (ball.wicket) return `${ball.label} · WICKET! ${batter} is out`;
  if (ball.runs === 6) return `${ball.label} · SIX! ${batter} sends it into the stands`;
  if (ball.runs === 4) return `${ball.label} · FOUR! ${batter} finds the boundary`;
  if (ball.runs === 0) return `${ball.label} · Dot ball`;
  return `${ball.label} · ${ball.runs} run${ball.runs === 1 ? '' : 's'} for ${batter}`;
}

/** Runs and balls still needed in a chase; null when there is no target. */
export function neededToWin(target: number | null, runs: number, legalBalls: number, ballsPerInnings: number) {
  if (target == null) return null;
  return { runs: Math.max(0, target - runs), balls: Math.max(0, ballsPerInnings - legalBalls) };
}
