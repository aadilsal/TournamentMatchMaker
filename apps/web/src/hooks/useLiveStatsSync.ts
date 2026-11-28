import { useQueryClient } from '@tanstack/react-query';
import { LIVE_QUERY_KEYS } from '@/lib/query-keys';
import { useSocketEvent } from '@/hooks/useSocket';

/** Refreshes dashboard, My stats and leaderboards the moment a score or innings lands. */
export function useLiveStatsSync(enabled: boolean) {
  const queryClient = useQueryClient();
  useSocketEvent(
    'match:updated',
    () => {
      for (const key of [['player-dashboard'], ['player-stats'], ['leaderboards'], LIVE_QUERY_KEYS.me]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
    enabled
  );
}
