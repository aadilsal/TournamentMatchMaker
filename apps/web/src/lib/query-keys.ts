import type { Match, QueueStatus } from '@vr-tournament/shared';
import type { QueryClient } from '@tanstack/react-query';

export const LIVE_QUERY_KEYS = {
  matches: ['matches'] as const,
  buybackOptions: ['buyback-options'] as const,
  matchmakingStatus: ['matchmaking-status'] as const,
  bookings: ['bookings'] as const,
  notifications: ['notifications'] as const,
};

export function invalidateLiveQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: LIVE_QUERY_KEYS.matches });
  queryClient.invalidateQueries({ queryKey: LIVE_QUERY_KEYS.buybackOptions });
  queryClient.invalidateQueries({ queryKey: LIVE_QUERY_KEYS.matchmakingStatus });
  queryClient.invalidateQueries({ queryKey: LIVE_QUERY_KEYS.bookings });
  queryClient.invalidateQueries({ queryKey: LIVE_QUERY_KEYS.notifications });
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
