import type { Pool } from 'pg';
import {
  INNINGS_HEARTBEAT_TIMEOUT_MS,
  ballLabel,
  ballsPerInnings,
  drawRoundLabel,
  neededToWin,
  normalizeOvers,
  oversText,
  type LiveBall,
  type LiveInnings,
  type LiveMatchView,
} from '@vr-tournament/shared';
import { AppError } from '../../lib/response.js';

const toBall = (r: Record<string, unknown>): LiveBall => ({
  seq: Number(r.seq),
  label: ballLabel(Number(r.seq)),
  runs: Number(r.runs),
  wicket: r.is_wicket === true,
  totalRuns: Number(r.total_runs),
  wicketsLost: Number(r.wickets_lost),
  at: (r.created_at as Date).toISOString(),
});

/** Public, read-only view of one tournament match, ball by ball. */
export async function buildLiveMatch(pool: Pool, matchId: string): Promise<LiveMatchView> {
  const m = (
    await pool.query(
      `SELECT m.id, m.status, m.result, m.player1_id, m.player2_id, m.tournament_id, m.round_number,
              t.name AS tournament_name, t.overs, t.play_format,
              u1.username AS p1, u2.username AS p2,
              (SELECT COUNT(*)::int FROM matches mm WHERE mm.tournament_id = m.tournament_id AND mm.round_number = m.round_number) AS round_matches
       FROM matches m
       JOIN tournaments t ON t.id = m.tournament_id AND t.status <> 'draft'
       JOIN users u1 ON u1.id = m.player1_id
       JOIN users u2 ON u2.id = m.player2_id
       WHERE m.id = $1`,
      [matchId]
    )
  ).rows[0];
  if (!m) throw new AppError('NOT_FOUND', 'Match not found', 404);

  const [innings, attempts, balls] = await Promise.all([
    pool.query(`SELECT user_id, score, wickets_lost, balls_faced, played_at FROM match_innings WHERE match_id = $1`, [matchId]),
    pool.query(
      `SELECT user_id, started_at, last_heartbeat_at > NOW() - ($2::bigint * INTERVAL '1 millisecond') AS fresh
       FROM innings_attempts WHERE match_id = $1`,
      [matchId, INNINGS_HEARTBEAT_TIMEOUT_MS]
    ),
    pool.query(`SELECT user_id, seq, runs, is_wicket, total_runs, wickets_lost, created_at FROM innings_balls WHERE match_id = $1 ORDER BY seq`, [matchId]),
  ]);

  const overs = normalizeOvers(m.overs);
  const perInnings = ballsPerInnings(overs);
  const nameOf = (id: string) => (id === m.player1_id ? (m.p1 as string) : (m.p2 as string));
  const inningsOf = (id: string) => innings.rows.find((r) => r.user_id === id);
  const attemptOf = (id: string) => attempts.rows.find((r) => r.user_id === id);
  // Batting order: who finished or started first.
  const startedAt = (id: string) =>
    (inningsOf(id)?.played_at as Date | undefined)?.getTime() ??
    (attemptOf(id)?.started_at as Date | undefined)?.getTime() ??
    Number.MAX_SAFE_INTEGER;
  const order = [m.player1_id as string, m.player2_id as string].sort((a, b) => startedAt(a) - startedAt(b));

  const sides: LiveInnings[] = order.map((id, i) => {
    const done = inningsOf(id);
    const myBalls = balls.rows.filter((r) => r.user_id === id).map(toBall);
    const last = myBalls[myBalls.length - 1];
    const batting = !done && attemptOf(id)?.fresh === true;
    const runs = done ? Number(done.score) : (last?.totalRuns ?? 0);
    const legalBalls = done ? Number(done.balls_faced ?? last?.seq ?? 0) : (last?.seq ?? 0);
    return {
      userId: id,
      username: nameOf(id),
      state: done ? 'done' : batting ? 'batting' : 'waiting',
      runs,
      wickets: done ? Number(done.wickets_lost ?? last?.wicketsLost ?? 0) : (last?.wicketsLost ?? 0),
      legalBalls,
      overs: oversText(legalBalls),
      balls: myBalls,
      target: i === 1 && inningsOf(order[0]) ? Number(inningsOf(order[0])!.score) + 1 : null,
    };
  });

  const result = (m.result ?? {}) as Record<string, unknown>;
  const finished = m.status === 'completed' || m.status === 'expired';
  const winnerId = (result.winnerId as string | null | undefined) ?? null;
  const chase = sides[1];
  const needed = !finished && chase.state === 'batting' ? neededToWin(chase.target, chase.runs, chase.legalBalls, perInnings) : null;
  const anyPlay = sides.some((s) => s.state !== 'waiting' || s.balls.length > 0);
  const batting = sides.find((s) => s.state === 'batting');

  const headline = finished
    ? winnerId
      ? `${nameOf(winnerId)} won`
      : 'No result'
    : needed
      ? `${chase.username} needs ${needed.runs} off ${needed.balls}`
      : batting
        ? `${batting.username} is batting: ${batting.runs}/${batting.wickets} (${batting.overs})`
        : sides[0].state === 'done'
          ? `${chase.username} to chase ${chase.target ?? sides[0].runs + 1}`
          : 'Waiting for the first ball';

  return {
    matchId,
    tournamentId: (m.tournament_id as string) ?? null,
    tournamentName: (m.tournament_name as string) ?? null,
    roundLabel:
      m.round_number == null
        ? null
        : m.play_format === 'draw'
          ? drawRoundLabel(Number(m.round_matches) * 2, Number(m.round_number))
          : `Round ${m.round_number}`,
    overs,
    ballsPerInnings: perInnings,
    status: finished ? 'finished' : anyPlay ? 'live' : 'upcoming',
    innings: sides,
    needed,
    winnerId,
    headline,
  };
}
