import type { Pool } from 'pg';
import {
  INNINGS_HEARTBEAT_TIMEOUT_MS,
  battingLeaderboards,
  battingTotals,
  type InningsRow,
  type LiveMatch,
  type TournamentLive,
  type TournamentPlayer,
  type TournamentStats,
} from '@vr-tournament/shared';
import { AppError } from '../../lib/response.js';

/** Public, read-only views for the tournament page: players, the live round and batting stats. */
export class TournamentViewService {
  constructor(private pool: Pool) {}

  private async tournament(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError('NOT_FOUND', 'Tournament not found', 404);
    const t = (await this.pool.query(`SELECT id, status, current_round_number, champion_id FROM tournaments WHERE id = $1`, [id])).rows[0];
    if (!t) throw new AppError('NOT_FOUND', 'Tournament not found', 404);
    return t;
  }

  async players(tournamentId: string): Promise<TournamentPlayer[]> {
    const t = await this.tournament(tournamentId);
    const rows = await this.pool.query(
      `SELECT u.id, u.username, u.skill_tier, reg.play_location, v.name AS venue_name,
              tp.status, tp.round_number, COALESCE(tp.wins, 0) AS wins, COALESCE(tp.losses, 0) AS losses
       FROM tournament_registrations reg
       JOIN users u ON u.id = reg.user_id AND NOT u.is_bot
       LEFT JOIN venues v ON v.id = reg.venue_id
       LEFT JOIN tournament_participants tp ON tp.tournament_id = reg.tournament_id AND tp.user_id = reg.user_id
       WHERE reg.tournament_id = $1`,
      [tournamentId]
    );
    const started = t.status === 'in_progress' || t.status === 'completed';
    const players: TournamentPlayer[] = rows.rows.map((r) => ({
      userId: r.id as string,
      username: r.username as string,
      skillTier: Number(r.skill_tier ?? 3),
      playingAt: r.play_location === 'home' ? 'Home' : ((r.venue_name as string | null) ?? null),
      status:
        t.champion_id === r.id
          ? 'champion'
          : !started
            ? 'registered'
            : r.status === 'active' && t.status === 'in_progress'
              ? 'in'
              : 'out',
      roundReached: r.round_number != null ? Number(r.round_number) : null,
      wins: Number(r.wins),
      losses: Number(r.losses),
    }));
    const rank = { champion: 0, in: 1, registered: 2, out: 3 } as const;
    return players.sort(
      (a, b) => rank[a.status] - rank[b.status] || (b.roundReached ?? 0) - (a.roundReached ?? 0) || b.wins - a.wins || a.username.localeCompare(b.username)
    );
  }

  async live(tournamentId: string): Promise<TournamentLive> {
    const t = await this.tournament(tournamentId);
    if (t.status !== 'in_progress') return { round: null, matches: [] };
    const roundNumber = Number(t.current_round_number ?? 1);
    const round = (
      await this.pool.query(`SELECT ends_at, status FROM tournament_rounds WHERE tournament_id = $1 AND round_number = $2`, [tournamentId, roundNumber])
    ).rows[0];
    const matches = await this.pool.query(
      `SELECT m.id, m.status, m.result, m.player1_id, m.player2_id,
              u1.username AS p1, u1.is_bot AS b1, u2.username AS p2, u2.is_bot AS b2
       FROM matches m
       JOIN users u1 ON u1.id = m.player1_id
       JOIN users u2 ON u2.id = m.player2_id
       WHERE m.tournament_id = $1 AND m.round_number = $2
       ORDER BY m.bracket_slot`,
      [tournamentId, roundNumber]
    );
    const ids = matches.rows.map((m) => m.id as string);
    const innings = ids.length
      ? (await this.pool.query(`SELECT match_id, user_id, score FROM match_innings WHERE match_id = ANY($1)`, [ids])).rows
      : [];
    const batting = ids.length
      ? (
          await this.pool.query(
            `SELECT a.match_id, a.user_id FROM innings_attempts a
             WHERE a.match_id = ANY($1)
               AND a.last_heartbeat_at > NOW() - ($2::bigint * INTERVAL '1 millisecond')
               AND NOT EXISTS (SELECT 1 FROM match_innings mi WHERE mi.match_id = a.match_id AND mi.user_id = a.user_id)`,
            [ids, INNINGS_HEARTBEAT_TIMEOUT_MS]
          )
        ).rows
      : [];
    const scoreOf = (matchId: string, userId: string) => {
      const r = innings.find((i) => i.match_id === matchId && i.user_id === userId);
      return r ? Number(r.score) : null;
    };
    const isBatting = (matchId: string, userId: string) => batting.some((b) => b.match_id === matchId && b.user_id === userId);

    let label = `Round ${roundNumber}`;
    const live: LiveMatch[] = matches.rows.map((m) => {
      const result = (m.result ?? {}) as Record<string, unknown>;
      if (typeof result.roundLabel === 'string') label = result.roundLabel;
      const s1 = scoreOf(m.id, m.player1_id);
      const s2 = scoreOf(m.id, m.player2_id);
      const bat1 = isBatting(m.id, m.player1_id);
      const bat2 = isBatting(m.id, m.player2_id);
      const winnerId = (result.winnerId as string | null | undefined) ?? null;
      const decided = m.status === 'completed' || m.status === 'expired';
      const state: LiveMatch['state'] = decided
        ? winnerId
          ? 'decided'
          : 'no_result'
        : bat1 || bat2
          ? 'batting'
          : s1 != null || s2 != null
            ? 'chasing'
            : 'to_play';
      const firstScore = s1 != null && s2 == null ? s1 : s2 != null && s1 == null ? s2 : null;
      return {
        id: m.id as string,
        state,
        player1: { username: m.p1 as string, isBot: m.b1 === true, score: s1, batting: bat1 },
        player2: { username: m.p2 as string, isBot: m.b2 === true, score: s2, batting: bat2 },
        target: !decided && firstScore != null ? firstScore + 1 : null,
        winner: winnerId === m.player1_id ? (m.p1 as string) : winnerId === m.player2_id ? (m.p2 as string) : null,
        tieReplay: result.tiedFirstBatterId != null,
      };
    });
    return {
      round: { number: roundNumber, label, closesAt: (round?.ends_at as Date | undefined)?.toISOString() ?? null, status: (round?.status as string) ?? 'active' },
      matches: live,
    };
  }

  async stats(tournamentId: string): Promise<TournamentStats> {
    await this.tournament(tournamentId);
    const rows = await this.pool.query(
      `SELECT mi.user_id, u.username, mi.score, mi.fours, mi.sixes, mi.wickets_lost, COALESCE(t.overs, 1) AS overs
       FROM match_innings mi
       JOIN matches m ON m.id = mi.match_id
       JOIN tournaments t ON t.id = m.tournament_id
       JOIN users u ON u.id = mi.user_id
       WHERE m.tournament_id = $1 AND NOT u.is_bot AND mi.source <> 'bot'`,
      [tournamentId]
    );
    const innings: InningsRow[] = rows.rows.map((r) => ({
      userId: r.user_id as string,
      username: r.username as string,
      score: Number(r.score),
      fours: r.fours != null ? Number(r.fours) : null,
      sixes: r.sixes != null ? Number(r.sixes) : null,
      wicketsLost: r.wickets_lost != null ? Number(r.wickets_lost) : null,
      overs: Number(r.overs),
    }));
    return { totals: battingTotals(innings), leaderboards: battingLeaderboards(innings) };
  }
}
