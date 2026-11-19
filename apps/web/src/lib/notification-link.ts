import { sanitizeReturnTo } from './return-to.ts';

const MY_TOURNAMENT_TYPES = new Set([
  'round_started',
  'round_closing_soon',
  'opponent_played',
  'match_tied',
  'tournament_starting_soon',
  'tournament_finished',
  'tournament_registered',
  'buyback_completed',
]);

/** Where a notification should take the player: My tournaments for play news, else its `link`, else by type. */
export function notificationLink(n: { type: string; payload?: Record<string, unknown> | null }): string | null {
  const p = n.payload ?? {};
  const own = typeof p.link === 'string' ? sanitizeReturnTo(p.link) : null;
  // Round and match news lands on My tournaments, where the next action is.
  if (MY_TOURNAMENT_TYPES.has(n.type) || n.type.startsWith('match_')) return '/my-tournaments';
  if (own) return own;
  const tournamentId = typeof p.tournamentId === 'string' && p.tournamentId ? p.tournamentId : null;
  if (n.type === 'opponent_withdrew_requeued') return '/my-tournaments';
  if (n.type.startsWith('tournament_')) {
    return tournamentId ? `/tournaments/${encodeURIComponent(tournamentId)}` : '/tournaments';
  }
  if (n.type.startsWith('booking')) return '/bookings';
  if (n.type.startsWith('buyback_')) return tournamentId ? `/tournaments/${encodeURIComponent(tournamentId)}` : '/matches';
  return null;
}
