import type { Pool } from 'pg';
import type { MatchResultExtended, PlayerCard, PlayerCardTournament } from '@vr-tournament/shared';
import {
  NO_SCORE,
  ballsPerInnings,
  normalizeOvers,
  drawRoundLabel,
  knockoutRoundLabel,
  playerGreeting,
  playerStatusText,
  playerTournamentStatus,
  tierLabel,
} from '@vr-tournament/shared';
import { AppError } from './response.js';

/** A player's card: profile, record and standing in each tournament. Used by the headset and the web app. */
export async function buildPlayerCard(pool: Pool, userId: string, timeZone?: string): Promise<PlayerCard> {
  const userResult = await pool.query(
    `SELECT u.id, u.username, u.city, u.has_vr_headset, u.skill_tier, u.rating_points,
            COALESCE(s.wins, 0)::int AS wins, COALESCE(s.losses, 0)::int AS losses, COALESCE(s.played, 0)::int AS played
     FROM users u
     LEFT JOIN LATERAL (
       SELECT COUNT(*) FILTER (WHERE (m.result->>'winnerId')::uuid = u.id) AS wins,
              COUNT(*) FILTER (WHERE (m.result->>'winnerId')::uuid <> u.id) AS losses,
              COUNT(*) AS played
       FROM matches m
       WHERE m.status = 'completed' AND m.result->>'winnerId' IS NOT NULL
         AND (m.player1_id = u.id OR m.player2_id = u.id)
     ) s ON TRUE
     WHERE u.id = $1 AND u.is_bot = FALSE`,
    [userId]
  );
  const user = userResult.rows[0];
  if (!user) throw new AppError('NOT_FOUND', 'Player not found', 404);

  const tournamentRows = await pool.query(
    `SELECT t.id, t.name, t.status, t.start_date, t.current_round_number, t.champion_id, t.play_format, t.overs,
            reg.play_location, v.id AS venue_id, v.name AS venue_name, v.city AS venue_city,
            tp.status AS participant_status, tp.round_number AS participant_round,
            tr.round_number, tr.starts_at, tr.ends_at, tr.status AS round_status,
            (SELECT COUNT(*)::int FROM matches mm
              WHERE mm.tournament_id = t.id AND mm.round_number = tr.round_number) AS round_matches
     FROM tournament_registrations reg
     JOIN tournaments t ON t.id = reg.tournament_id
     LEFT JOIN venues v ON v.id = reg.venue_id
     LEFT JOIN tournament_participants tp ON tp.tournament_id = t.id AND tp.user_id = reg.user_id
     LEFT JOIN tournament_rounds tr ON tr.tournament_id = t.id AND tr.round_number = t.current_round_number
     WHERE reg.user_id = $1
       AND (t.status IN ('open', 'closed', 'in_progress')
            OR (t.status = 'completed' AND t.updated_at > NOW() - INTERVAL '7 days'))
     ORDER BY (t.status = 'in_progress') DESC, t.start_date ASC
     LIMIT 20`,
    [userId]
  );

  const ids = tournamentRows.rows.map((r) => r.id as string);
  const matchRows = ids.length
    ? await pool.query(
        `SELECT DISTINCT ON (m.tournament_id)
                m.id, m.tournament_id, m.status, m.player1_id, m.result, opp.username AS opponent,
                mine.score AS my_innings, theirs.score AS their_innings
         FROM matches m
         JOIN tournaments t ON t.id = m.tournament_id AND m.round_number = t.current_round_number
         JOIN users opp ON opp.id = CASE WHEN m.player1_id = $1 THEN m.player2_id ELSE m.player1_id END
         LEFT JOIN match_innings mine ON mine.match_id = m.id AND mine.user_id = $1
         LEFT JOIN match_innings theirs ON theirs.match_id = m.id AND theirs.user_id <> $1
         WHERE (m.player1_id = $1 OR m.player2_id = $1)
           AND m.tournament_id = ANY($2)
           AND m.status IN ('confirmed', 'in_progress', 'completed')
         ORDER BY m.tournament_id, m.created_at DESC`,
        [userId, ids]
      )
    : { rows: [] as Record<string, unknown>[] };
  const matchOf = new Map(matchRows.rows.map((m) => [m.tournament_id as string, m]));

  const tournaments: PlayerCardTournament[] = tournamentRows.rows.map((t) => {
    const m = matchOf.get(t.id as string);
    const roundNumber = t.round_number != null ? Number(t.round_number) : null;
    const roundLabel =
      roundNumber == null
        ? null
        : t.play_format === 'draw'
          ? drawRoundLabel(Number(t.round_matches) * 2, roundNumber)
          : knockoutRoundLabel(roundNumber);

    let match: PlayerCardTournament['match'] = null;
    if (m) {
      const result = (m.result ?? {}) as MatchResultExtended;
      const isP1 = m.player1_id === userId;
      const decided = m.status === 'completed';
      const myScore = decided ? (isP1 ? result.player1Score : result.player2Score) : m.my_innings;
      const theirScore = decided ? (isP1 ? result.player2Score : result.player1Score) : m.their_innings;
      match = {
        id: m.id as string,
        opponent: m.opponent as string,
        state: decided ? 'decided' : m.my_innings != null ? 'waiting_for_opponent' : 'your_turn',
        myScore: (myScore as number | null | undefined) ?? NO_SCORE,
        opponentScore: (theirScore as number | null | undefined) ?? NO_SCORE,
      };
    }

    const myStatus = playerTournamentStatus({
      tournamentStatus: t.status,
      participantStatus: t.participant_status ?? null,
      participantRound: t.participant_round ?? null,
      currentRound: t.current_round_number ?? null,
      isChampion: t.champion_id === userId,
    });
    const startDate = (t.start_date as Date).toISOString();
    const closesAt = (t.ends_at as Date | null)?.toISOString() ?? null;

    return {
      id: t.id as string,
      name: t.name as string,
      status: t.status === 'in_progress' ? 'live' : t.status === 'completed' ? 'finished' : 'upcoming',
      startDate,
      overs: normalizeOvers(t.overs),
      ballsPerInnings: ballsPerInnings(t.overs),
      playingAt:
        t.play_location === 'home'
          ? { type: 'home', name: 'Home' }
          : t.play_location === 'venue' && t.venue_name
            ? { type: 'venue', id: t.venue_id as string, name: t.venue_name as string, city: (t.venue_city as string) ?? '' }
            : null,
      myStatus,
      statusText: playerStatusText({
        status: myStatus,
        tournamentName: t.name as string,
        startDate,
        roundLabel,
        roundClosesAt: closesAt,
        opponent: match && match.state !== 'decided' ? match.opponent : null,
        matchState: match?.state ?? null,
        timeZone,
      }),
      round:
        roundNumber == null || t.status !== 'in_progress'
          ? null
          : {
              number: roundNumber,
              label: roundLabel ?? `Round ${roundNumber}`,
              state:
                t.round_status === 'closed'
                  ? 'closed'
                  : new Date(t.starts_at).getTime() > Date.now()
                    ? 'upcoming'
                    : 'open',
              opensAt: (t.starts_at as Date | null)?.toISOString() ?? null,
              closesAt,
            },
      match,
    };
  });

  const skillTier = Number(user.skill_tier ?? 3);
  return {
    userId: user.id,
    username: user.username,
    city: user.city ?? null,
    greeting: playerGreeting(user.username, tournaments, Number(user.played ?? 0)),
    hasVrHeadset: user.has_vr_headset === true,
    skillTier,
    skillTierLabel: tierLabel(skillTier),
    ratingPoints: Number(user.rating_points ?? 0),
    record: { played: user.played, wins: user.wins, losses: user.losses },
    tournaments,
  };
}
