import { knockoutRoundLabel } from './round-advancement.js';

/** Structural so shared needs no `pg` dependency; a pg Pool or PoolClient fits. */
export interface NotificationQueryable {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

export type MatchNotificationType =
  | 'match_found'
  | 'match_confirmed'
  | 'match_declined'
  | 'match_expired'
  | 'match_won'
  | 'match_lost'
  | 'opponent_withdrew_requeued';

export interface MatchNotificationDetails {
  message: string;
  link: string;
  opponentUsername: string | null;
  tournamentId: string | null;
  tournamentName: string | null;
  roundNumber: number | null;
  roundLabel: string | null;
  /** Start of the recipient's own play window (ISO), else the match's. */
  slotStartsAt: string | null;
}

const MATCH_COPY: Record<MatchNotificationType, (vs: string, where: string) => string> = {
  match_found: (vs, where) => `New match against ${vs}${where}.`,
  match_confirmed: (vs, where) => `Your match against ${vs}${where} is confirmed.`,
  match_declined: (vs, where) => `${vs} declined your match${where}. We’re finding you another opponent.`,
  match_expired: (vs, where) => `Your match against ${vs}${where} expired before it was played.`,
  match_won: (vs, where) => `You beat ${vs}${where}!`,
  match_lost: (vs, where) => `You lost to ${vs}${where}.`,
  opponent_withdrew_requeued: (vs, where) =>
    `${vs} withdrew${where}. You’re back in the queue for a new match.`,
};

/** Pure copy builder, split out so it can be tested without a database. */
export function matchNotificationMessage(
  type: MatchNotificationType,
  ctx: { opponentUsername: string | null; tournamentName: string | null; roundNumber: number | null }
): string {
  const vs = ctx.opponentUsername ?? 'your opponent';
  const round = ctx.roundNumber != null ? knockoutRoundLabel(ctx.roundNumber) : null;
  const where = ctx.tournamentName ? ` in ${ctx.tournamentName}${round ? `, ${round}` : ''}` : '';
  const text = MATCH_COPY[type](vs, where);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Opponent, tournament, round, slot time, `message` and `link` for a match notification payload. */
export async function matchNotificationDetails(
  db: NotificationQueryable,
  type: MatchNotificationType,
  matchId: string,
  recipientId: string
): Promise<MatchNotificationDetails> {
  // A failed lookup must not stop the notification; it falls back to generic copy.
  let rows: any[] = [];
  try {
    ({ rows } = await db.query(
      `SELECT m.tournament_id, m.round_number, t.name AS tournament_name, u.username AS opponent,
              COALESCE(mine.start_time, ts.start_time, m.scheduled_at) AS starts_at
       FROM matches m
       LEFT JOIN tournaments t ON t.id = m.tournament_id
       LEFT JOIN time_slots ts ON ts.id = m.time_slot_id
       LEFT JOIN users u ON u.id = CASE WHEN m.player1_id = $2 THEN m.player2_id ELSE m.player1_id END
       LEFT JOIN tournament_round_slots rs
         ON rs.tournament_id = m.tournament_id AND rs.user_id = $2 AND rs.round_number = m.round_number
       LEFT JOIN time_slots mine ON mine.id = rs.time_slot_id
       WHERE m.id = $1`,
      [matchId, recipientId]
    ));
  } catch {
    rows = [];
  }
  const r = rows[0];
  const ctx = {
    opponentUsername: (r?.opponent as string | undefined) ?? null,
    tournamentName: (r?.tournament_name as string | undefined) ?? null,
    roundNumber: (r?.round_number as number | undefined) ?? null,
  };
  return {
    ...ctx,
    message: matchNotificationMessage(type, ctx),
    link: '/matches',
    tournamentId: (r?.tournament_id as string | undefined) ?? null,
    roundLabel: ctx.roundNumber != null ? knockoutRoundLabel(ctx.roundNumber) : null,
    slotStartsAt: r?.starts_at ? new Date(r.starts_at).toISOString() : null,
  };
}

export const tournamentLink = (tournamentId: string) => `/tournaments/${tournamentId}`;
