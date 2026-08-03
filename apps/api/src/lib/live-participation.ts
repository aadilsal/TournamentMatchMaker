import type { Pool } from 'pg';
import { LIVE_PARTICIPATION_SQL } from '@vr-tournament/shared';
import { AppError } from './response.js';

export interface LiveTournamentRef {
  id: string;
  name: string;
}

/**
 * The one tournament a player is currently holding a place in, if any.
 *
 * Registration and queue-join each used to run their own version of this query
 * and they disagreed in both directions: registration ignored the tournament's
 * status (so a *finished* tournament locked a player out forever) while
 * treating `eliminated` as free, and queue-join did the opposite. Both now call
 * this, so the button the UI renders and the answer the API gives can't drift.
 */
export async function findLiveTournament(
  pool: Pool,
  userId: string,
  excludeTournamentId?: string
): Promise<LiveTournamentRef | null> {
  const params: unknown[] = [userId];
  let exclude = '';
  if (excludeTournamentId) {
    params.push(excludeTournamentId);
    exclude = ` AND tp.tournament_id <> $${params.length}`;
  }

  const result = await pool.query(
    `SELECT t.id, t.name
     FROM tournament_participants tp
     JOIN tournaments t ON t.id = tp.tournament_id
     WHERE tp.user_id = $1${exclude}
       AND ${LIVE_PARTICIPATION_SQL}
     LIMIT 1`,
    params
  );

  const row = result.rows[0];
  return row ? { id: row.id as string, name: row.name as string } : null;
}

export async function assertNoOtherLiveTournament(
  pool: Pool,
  userId: string,
  tournamentId: string
): Promise<void> {
  const other = await findLiveTournament(pool, userId, tournamentId);
  if (other) {
    throw new AppError(
      'CONFLICT',
      `You are already playing in "${other.name}" — finish or withdraw from it before joining another tournament`,
      409
    );
  }
}
