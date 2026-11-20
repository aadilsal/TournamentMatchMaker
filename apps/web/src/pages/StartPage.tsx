import { Navigate } from 'react-router-dom';
import { getAccessToken } from '@/lib/api';
import { useJourney } from '@/lib/journey';
import { RouteFallback } from '@/components/ui/route-fallback';
import { QueryError } from '@/components/ui/query-error';

/** Sends a player to the right step: choose a tournament first, otherwise their tournaments. */
export function StartPage() {
  const journey = useJourney();
  if (!getAccessToken()) return <Navigate to="/register?returnTo=%2Fstart" replace />;
  if (journey.isLoading) return <RouteFallback variant="app-content" />;
  if (journey.isError) {
    return <QueryError error={journey.error} resource="your tournaments" onRetry={() => journey.refetch()} />;
  }
  return <Navigate to={journey.data?.step === 'my_tournaments' ? '/my-tournaments' : '/join'} replace />;
}
