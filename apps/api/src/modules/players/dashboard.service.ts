import type { Pool } from 'pg';
import {
  WICKETS_MIN_INNINGS_ALL_TIME,
  nextTierFor,
  tierFloor,
  battingLeaderboards,
  battingTotals,
  normalizeOvers,
  type FormEntry,
  type GlobalLeaderboards,
  type InningsRow,
  type LeaderboardEntry,
  type PlayerDashboard,
  type PlayerProfileStats,
  type ProfileMatch,
  type ProfileTournament,
} from '@vr-tournament/shared';
import { AppError } from '../../lib/response.js';

const FORM_SIZE = 5;
const PROFILE_MATCHES = 10;
const BOARD_SIZE = 10;

const inningsRow = (userId: string, username: string, r: Record<string, unknown>): InningsRow => ({
  userId,
  username,
  score: Number(r.score),
  fours: r.fours != null ? Number(r.fours) : null,
  sixes: r.sixes != null ? Number(r.sixes) : null,
  wicketsLost: r.wickets_lost != null ? Number(r.wickets_lost) : null,
  overs: r.overs != null ? Number(r.overs) : 1,
});

/** Player dashboard, public career profile and all-time leaderboards; bots are always left out. */
export class DashboardService {
  constructor(private pool: Pool) {}

  /** Career numbers plus every decided match, newest first. */
  private async career(userId: string, username: string, ratingPoints: number, skillTier: number) {
    const [innings, decided, tournaments] = await Promise.all([
      this.pool.query(
        `SELECT mi.score, mi.fours, mi.sixes, mi.wickets_lost, COALESCE(t.overs, 1) AS overs
         FROM match_innings mi JOIN matches m ON m.id = mi.match_id LEFT JOIN tournaments t ON t.id = m.tournament_id
         WHERE mi.user_id = $1 AND mi.source <> 'bot'`,
        [userId]
      ),
      this.pool.query(
        `SELECT m.id, m.tournament_id, t.name AS tournament_name, m.updated_at,
                (m.result->>'winnerId') = $1::text AS won, opp.username AS opponent,
                (SELECT score FROM match_innings WHERE match_id = m.id AND user_id = $1) AS my_score,
                (SELECT score FROM match_innings WHERE match_id = m.id AND user_id = opp.id) AS opp_score
         FROM matches m
         JOIN users opp ON opp.id = CASE WHEN m.player1_id = $1 THEN m.player2_id ELSE m.player1_id END
         LEFT JOIN tournaments t ON t.id = m.tournament_id
         WHERE (m.player1_id = $1 OR m.player2_id = $1) AND m.status = 'completed' AND m.result->>'winnerId' IS NOT NULL
         ORDER BY m.updated_at DESC`,
        [userId]
      ),
      this.pool.query(
        `SELECT COUNT(*)::int AS played, COUNT(*) FILTER (WHERE t.champion_id = $1)::int AS won
         FROM tournament_registrations r JOIN tournaments t ON t.id = r.tournament_id
         WHERE r.user_id = $1`,
        [userId]
      ),
    ]);
    const wins = decided.rows.filter((r) => r.won).length;
    const matches = decided.rows.length;
    const next = nextTierFor(skillTier, ratingPoints);
    const stats: PlayerDashboard['stats'] = {
      ...battingTotals(innings.rows.map((r) => inningsRow(userId, username, r))),
      matches,
      wins,
      losses: matches - wins,
      winRate: matches ? Math.round((wins / matches) * 100) : null,
      tournamentsPlayed: tournaments.rows[0]?.played ?? 0,
      tournamentsWon: tournaments.rows[0]?.won ?? 0,
      ratingPoints,
      skillTier,
      nextTier: next,
      tierProtected: ratingPoints < tierFloor(skillTier),
    };
    return { stats, decided: decided.rows };
  }

  async forPlayer(userId: string): Promise<PlayerDashboard> {
    const user = (await this.pool.query(`SELECT username, rating_points, skill_tier, display_title FROM users WHERE id = $1`, [userId])).rows[0];
    if (!user) throw new AppError('NOT_FOUND', 'Player not found', 404);
    const [{ stats, decided }, live, open] = await Promise.all([
      this.career(userId, user.username, Number(user.rating_points ?? 0), Number(user.skill_tier ?? 3)),
      this.pool.query(
        `SELECT t.id, t.name, t.overs, t.current_round_number,
                (SELECT COUNT(*)::int FROM tournament_registrations r JOIN users u ON u.id = r.user_id
                  WHERE r.tournament_id = t.id AND NOT u.is_bot) AS players
         FROM tournaments t
         WHERE t.status = 'in_progress' AND t.play_format = 'draw'
         ORDER BY t.start_date DESC LIMIT 5`
      ),
      this.pool.query(
        `SELECT t.id, t.name, t.overs, t.start_date, t.max_players,
                (SELECT COUNT(*)::int FROM tournament_registrations r JOIN users u ON u.id = r.user_id
                  WHERE r.tournament_id = t.id AND NOT u.is_bot) AS players
         FROM tournaments t
         WHERE t.status = 'open' AND t.play_format = 'draw' AND t.start_date > NOW()
           AND NOT EXISTS (SELECT 1 FROM tournament_registrations r WHERE r.tournament_id = t.id AND r.user_id = $1)
         ORDER BY t.start_date ASC LIMIT 4`,
        [userId]
      ),
    ]);

    const recentForm: FormEntry[] = decided.slice(0, FORM_SIZE).map((r) => ({
      matchId: r.id as string,
      tournamentId: (r.tournament_id as string | null) ?? null,
      tournamentName: (r.tournament_name as string | null) ?? null,
      opponent: r.opponent as string,
      myScore: r.my_score != null ? Number(r.my_score) : null,
      opponentScore: r.opp_score != null ? Number(r.opp_score) : null,
      result: r.won ? 'W' : 'L',
      decidedAt: (r.updated_at as Date).toISOString(),
    }));

    return {
      displayTitle: (user.display_title as string | null) ?? null,
      stats,
      recentForm,
      liveTournaments: live.rows.map((t) => ({
        id: t.id as string,
        name: t.name as string,
        overs: normalizeOvers(t.overs),
        roundNumber: Number(t.current_round_number ?? 1),
        playerCount: Number(t.players),
      })),
      openTournaments: open.rows.map((t) => ({
        id: t.id as string,
        name: t.name as string,
        overs: normalizeOvers(t.overs),
        startDate: (t.start_date as Date).toISOString(),
        playerCount: Number(t.players),
        maxPlayers: (t.max_players as number | null) ?? null,
      })),
    };
  }

  /** Public career page for any human player. */
  async profile(username: string): Promise<PlayerProfileStats> {
    const user = (
      await this.pool.query(
        `SELECT id, username, rating_points, skill_tier, display_title FROM users WHERE LOWER(username) = LOWER($1) AND NOT is_bot`,
        [username]
      )
    ).rows[0];
    if (!user) throw new AppError('NOT_FOUND', 'Player not found', 404);
    const userId = user.id as string;
    const [{ stats }, innings, tournaments] = await Promise.all([
      this.career(userId, user.username, Number(user.rating_points ?? 0), Number(user.skill_tier ?? 3)),
      this.pool.query(
        `SELECT mi.match_id, mi.score, mi.fours, mi.sixes, mi.wickets_lost, mi.played_at,
                m.tournament_id, t.name AS tournament_name, m.status, m.result->>'winnerId' AS winner_id,
                opp.username AS opponent,
                (SELECT score FROM match_innings WHERE match_id = m.id AND user_id = opp.id) AS opp_score
         FROM match_innings mi
         JOIN matches m ON m.id = mi.match_id
         JOIN users opp ON opp.id = CASE WHEN m.player1_id = $1 THEN m.player2_id ELSE m.player1_id END
         LEFT JOIN tournaments t ON t.id = m.tournament_id
         WHERE mi.user_id = $1
         ORDER BY mi.played_at DESC LIMIT $2`,
        [userId, PROFILE_MATCHES]
      ),
      this.pool.query(
        `SELECT t.id, t.name, t.overs, t.start_date, t.status, t.champion_id, tp.status AS p_status, tp.round_number
         FROM tournament_registrations r
         JOIN tournaments t ON t.id = r.tournament_id
         LEFT JOIN tournament_participants tp ON tp.tournament_id = t.id AND tp.user_id = r.user_id
         WHERE r.user_id = $1
         ORDER BY t.start_date DESC LIMIT 20`,
        [userId]
      ),
    ]);

    const recentMatches: ProfileMatch[] = innings.rows.map((r) => ({
      matchId: r.match_id as string,
      tournamentId: (r.tournament_id as string | null) ?? null,
      tournamentName: (r.tournament_name as string | null) ?? null,
      opponent: r.opponent as string,
      myScore: Number(r.score),
      opponentScore: r.opp_score != null ? Number(r.opp_score) : null,
      result: r.status === 'completed' && r.winner_id ? (r.winner_id === userId ? 'W' : 'L') : null,
      fours: r.fours != null ? Number(r.fours) : null,
      sixes: r.sixes != null ? Number(r.sixes) : null,
      wicketsLost: r.wickets_lost != null ? Number(r.wickets_lost) : null,
      playedAt: (r.played_at as Date).toISOString(),
    }));
    const history: ProfileTournament[] = tournaments.rows.map((t) => ({
      id: t.id as string,
      name: t.name as string,
      overs: normalizeOvers(t.overs),
      startDate: (t.start_date as Date).toISOString(),
      finish:
        t.champion_id === userId
          ? 'champion'
          : t.status === 'open' || t.status === 'draft'
            ? 'registered'
            : t.p_status === 'active' && t.status === 'in_progress'
              ? 'in'
              : 'out',
      roundReached: t.round_number != null ? Number(t.round_number) : null,
    }));
    return { username: user.username as string, displayTitle: (user.display_title as string | null) ?? null, stats, recentMatches, tournaments: history };
  }

  /** All-time boards over every human innings, plus the highest rated players. */
  async leaderboards(): Promise<GlobalLeaderboards> {
    const [innings, rated] = await Promise.all([
      this.pool.query(
        `SELECT mi.user_id, u.username, mi.score, mi.fours, mi.sixes, mi.wickets_lost, COALESCE(t.overs, 1) AS overs
         FROM match_innings mi JOIN users u ON u.id = mi.user_id
         JOIN matches m ON m.id = mi.match_id LEFT JOIN tournaments t ON t.id = m.tournament_id
         WHERE NOT u.is_bot AND mi.source <> 'bot'`
      ),
      this.pool.query(
        `SELECT u.id, u.username, u.rating_points,
                (SELECT COUNT(*)::int FROM match_innings mi WHERE mi.user_id = u.id) AS innings
         FROM users u
         WHERE NOT u.is_bot AND u.role = 'player' AND u.suspended_at IS NULL
           AND EXISTS (SELECT 1 FROM match_innings mi WHERE mi.user_id = u.id)
         ORDER BY u.rating_points DESC, u.username ASC LIMIT $1`,
        [BOARD_SIZE]
      ),
    ]);
    const boards: GlobalLeaderboards = {
      batting: battingLeaderboards(
        innings.rows.map((r) => inningsRow(r.user_id as string, r.username as string, r)),
        BOARD_SIZE,
        WICKETS_MIN_INNINGS_ALL_TIME
      ),
      topRated: rated.rows.map((r) => ({
        userId: r.id as string,
        username: r.username as string,
        value: Number(r.rating_points),
        innings: Number(r.innings),
      })),
    };
    return withTitles(this.pool, boards);
  }
}

/** Adds each player's shown title to every leaderboard row. */
async function withTitles(pool: Pool, boards: GlobalLeaderboards): Promise<GlobalLeaderboards> {
  const all = [...Object.values(boards.batting).flat(), ...boards.topRated] as LeaderboardEntry[];
  const ids = [...new Set(all.map((e) => e.userId))];
  if (!ids.length) return boards;
  const rows = await pool.query(`SELECT id, display_title FROM users WHERE id = ANY($1)`, [ids]);
  const titleOf = new Map(rows.rows.map((r) => [r.id as string, (r.display_title as string | null) ?? null]));
  for (const e of all) e.title = titleOf.get(e.userId) ?? null;
  return boards;
}
