import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LiveMatch, LiveMatchView, TournamentLive } from '@vr-tournament/shared';
import { apiGet } from '@/lib/api';
import { useLiveWatch } from '@/hooks/useLiveWatch';

/** The tournament's current round, refreshed the moment any ball in it lands. */
export function useTournamentLive(tournamentId: string | undefined, enabled = true) {
  const queryClient = useQueryClient();
  const key = ['tournament-live', tournamentId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => apiGet<TournamentLive>(`/tournaments/${tournamentId}/live`),
    enabled: !!tournamentId && enabled,
    refetchInterval: 15_000,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId, 'matches'] });
  };
  useLiveWatch('tournament', tournamentId, { onBall: refresh, onInnings: refresh }, !!tournamentId && enabled);
  const byMatch = new Map<string, LiveMatch>((query.data?.matches ?? []).map((m) => [m.id, m]));
  return { ...query, byMatch };
}

/** One match ball by ball, refreshed on every ball. */
export function useLiveMatch(matchId: string | undefined, enabled = true) {
  const queryClient = useQueryClient();
  const key = ['live-match', matchId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => apiGet<LiveMatchView>(`/live/matches/${matchId}`),
    enabled: !!matchId && enabled,
    refetchInterval: 30_000,
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: key });
  useLiveWatch('match', matchId, { onBall: refresh, onInnings: refresh }, !!matchId && enabled);
  return query;
}

/** "omar 23/1 (2.3)" for whoever is batting in a live round match, or null. */
export function liveScoreText(m: LiveMatch | undefined): string | null {
  const side = m && [m.player1, m.player2].find((s) => s.batting && s.live);
  return side?.live ? `${side.username} ${side.live.runs}/${side.live.wickets} (${side.live.overs})` : null;
}
