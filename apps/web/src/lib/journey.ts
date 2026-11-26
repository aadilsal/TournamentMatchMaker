import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PlayerCard } from '@vr-tournament/shared';
import { apiGet, getAccessToken } from '@/lib/api';
import { useSocketEvent } from '@/hooks/useSocket';

/** Which step of the guided flow the player is on (server-decided). */
export interface PlayerJourney {
  step: 'choose_tournament' | 'my_tournaments';
  hasVrHeadset: boolean;
  activeTournamentCount: number;
}

export const JOURNEY_KEYS = {
  journey: ['journey'] as const,
  myTournaments: ['my-tournaments'] as const,
};

/** The viewer's IANA time zone, so server-written sentences use local times. */
export function viewerTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

export function useJourney() {
  return useQuery({
    queryKey: JOURNEY_KEYS.journey,
    queryFn: () => apiGet<PlayerJourney>('/players/me/journey'),
    enabled: !!getAccessToken(),
    staleTime: 10_000,
  });
}

/** The player's card: one entry per tournament, refreshed live on match and tournament events. */
export function useMyTournaments() {
  const queryClient = useQueryClient();
  const tz = viewerTimeZone();
  const query = useQuery({
    queryKey: JOURNEY_KEYS.myTournaments,
    queryFn: () => apiGet<PlayerCard>(`/players/me/tournaments${tz ? `?timeZone=${encodeURIComponent(tz)}` : ''}`),
    enabled: !!getAccessToken(),
    staleTime: 5_000,
    refetchInterval: 30_000,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: JOURNEY_KEYS.myTournaments });
    void queryClient.invalidateQueries({ queryKey: JOURNEY_KEYS.journey });
  };
  useSocketEvent('match:found', refresh);
  useSocketEvent('match:updated', refresh);
  useSocketEvent('tournament:updated', refresh);
  return query;
}

/** "45 minutes", "2 hours", "1 day 6 hours" — how long each round lasts. */
export function formatRoundLength(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const days = Math.floor(minutes / 1440);
  const hours = Math.round((minutes % 1440) / 60);
  const d = days ? `${days} day${days === 1 ? '' : 's'}` : '';
  const h = hours ? `${hours} hour${hours === 1 ? '' : 's'}` : '';
  return [d, h].filter(Boolean).join(' ');
}

/** Steps shown in the flow header. */
export const JOURNEY_STEPS = ['Choose a tournament', 'Where you play'] as const;
