import { sanitizeReturnTo } from './return-to.ts';

/** Where a notification should take the player: its own `link`, else a route by type, else null. */
export function notificationLink(n: { type: string; payload?: Record<string, unknown> | null }): string | null {
  const p = n.payload ?? {};
  const own = typeof p.link === 'string' ? sanitizeReturnTo(p.link) : null;
  if (own) return own;
  const tournamentId = typeof p.tournamentId === 'string' && p.tournamentId ? p.tournamentId : null;
  if (n.type.startsWith('match_') || n.type === 'opponent_withdrew_requeued') return '/matches';
  if (n.type.startsWith('tournament_')) {
    return tournamentId ? `/tournaments/${encodeURIComponent(tournamentId)}` : '/tournaments';
  }
  if (n.type.startsWith('booking')) return '/bookings';
  if (n.type.startsWith('buyback_')) return tournamentId ? `/tournaments/${encodeURIComponent(tournamentId)}` : '/matches';
  return null;
}
