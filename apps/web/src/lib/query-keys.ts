import type { Match, QueueStatus } from '@vr-tournament/shared';
import type { QueryClient } from '@tanstack/react-query';

export const LIVE_QUERY_KEYS = {
  matches: ['matches'] as const,
  buybackOptions: ['buyback-options'] as const,
  matchmakingStatus: ['matchmaking-status'] as const,
  bookings: ['bookings'] as const,
  notifications: ['notifications'] as const,
  tournaments: ['tournaments'] as const,
  me: ['players', 'me'] as const,
};

export function invalidateLiveQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: LIVE_QUERY_KEYS.matches });
  queryClient.invalidateQueries({ queryKey: LIVE_QUERY_KEYS.buybackOptions });
  queryClient.invalidateQueries({ queryKey: LIVE_QUERY_KEYS.matchmakingStatus });
  queryClient.invalidateQueries({ queryKey: LIVE_QUERY_KEYS.bookings });
  queryClient.invalidateQueries({ queryKey: LIVE_QUERY_KEYS.notifications });
  // Carries `liveTournament`, which decides whether Join is offered at all.
  queryClient.invalidateQueries({ queryKey: LIVE_QUERY_KEYS.me });
  invalidateTournamentQueries(queryClient);
}

/**
 * Registration counts, brackets, rounds and participants are spread across the
 * public list, the detail page and the admin panel — a change to any one of them
 * has to refresh all of them, so they are invalidated as a group.
 */
export function invalidateTournamentQueries(queryClient: QueryClient, tournamentId?: string) {
  queryClient.invalidateQueries({ queryKey: LIVE_QUERY_KEYS.tournaments });
  queryClient.invalidateQueries({ queryKey: ['admin', 'tournaments'] });

  if (tournamentId) {
    for (const key of [
      ['tournament', tournamentId],
      ['tournament-bracket', tournamentId],
      ['tournament-rounds', tournamentId],
      ['tournament-participants', tournamentId],
      ['tournament-registration', tournamentId],
      ['tournament-participant', tournamentId],
      ['tournament-slot-options', tournamentId],
      ['tournament-my-slot', tournamentId],
      ['admin', 'tournament', tournamentId],
    ]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
    return;
  }

  for (const key of [
    ['tournament'],
    ['tournament-bracket'],
    ['tournament-rounds'],
    ['tournament-participants'],
    ['tournament-registration'],
    ['tournament-participant'],
    ['tournament-slot-options'],
    ['tournament-my-slot'],
    ['admin', 'tournament'],
  ]) {
    queryClient.invalidateQueries({ queryKey: key });
  }
}

export function invalidateSlotQueries(
  queryClient: QueryClient,
  venueId?: string,
  date?: string
) {
  if (venueId) {
    queryClient.invalidateQueries({ queryKey: ['slots', venueId] });
    if (date) {
      queryClient.invalidateQueries({ queryKey: ['slots', venueId, date] });
    }
  } else {
    queryClient.invalidateQueries({ queryKey: ['slots'] });
  }
}

export function matchesNeedPolling(matches: Match[] | undefined): boolean {
  return (
    matches?.some((m) =>
      ['pending_confirmation', 'confirmed', 'in_progress'].includes(m.status)
    ) ?? false
  );
}

export function queueNeedsPolling(status: QueueStatus | undefined): boolean {
  return status?.inQueue ?? false;
}

export const LIVE_STALE_TIME = 0;
export const SAFETY_POLL_MS = 5000;
