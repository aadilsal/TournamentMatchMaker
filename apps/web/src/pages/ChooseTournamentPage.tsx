import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Tournament } from '@vr-tournament/shared';
import { oversLabel } from '@vr-tournament/shared';
import { Calendar, CircleDot, Timer, Trophy, Users, RotateCcw } from 'lucide-react';
import { apiGet, getAccessToken } from '@/lib/api';
import { formatDateTime, formatMoneyCents } from '@/lib/format';
import { formatRoundLength, useMyTournaments } from '@/lib/journey';
import { JourneySteps } from '@/components/journey/JourneySteps';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { GridSkeleton } from '@/components/ui/skeleton';
import { QueryError } from '@/components/ui/query-error';

/** Step 1: pick a tournament. Only tournaments still taking players are shown. */
export function ChooseTournamentPage() {
  const navigate = useNavigate();
  const loggedIn = !!getAccessToken();
  const { data: tournaments = [], isLoading, error, refetch } = useQuery({
    queryKey: ['tournaments', 'joinable'],
    queryFn: () => apiGet<Tournament[]>('/tournaments?status=open&limit=50'),
    enabled: loggedIn,
  });
  const mine = useMyTournaments();

  if (!loggedIn) return <Navigate to="/register?returnTo=%2Fjoin" replace />;

  const now = Date.now();
  const joinable = tournaments.filter((t) => t.playFormat === 'draw' && new Date(t.startDate).getTime() > now);
  const myIds = new Set((mine.data?.tournaments ?? []).map((t) => t.id));
  const hasTournaments = (mine.data?.tournaments ?? []).length > 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <JourneySteps current={0} />
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Choose a tournament</h1>
        <p className="text-[var(--color-muted-foreground)] mt-1">
          Pick the tournament you want to play. Next you&rsquo;ll choose where you play it.
        </p>
      </header>

      {isLoading ? (
        <GridSkeleton cols={2} count={2} />
      ) : error ? (
        <QueryError error={error} resource="tournaments" onRetry={() => refetch()} />
      ) : joinable.length === 0 ? (
        <EmptyState
          icon={<Trophy className="h-12 w-12" />}
          title="No tournaments are open right now"
          description="New tournaments appear here as soon as they open — check back soon."
          action={hasTournaments ? { label: 'Go to my tournaments', href: '/my-tournaments' } : undefined}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {joinable.map((t) => {
            const joined = myIds.has(t.id);
            const full = !joined && t.maxPlayers != null && (t.registrationCount ?? 0) >= t.maxPlayers;
            return (
              <button
                key={t.id}
                type="button"
                disabled={full}
                onClick={() => navigate(`/join/${t.id}`)}
                className="text-left rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 flex flex-col gap-3 transition-colors hover:border-[var(--color-primary)]/60 focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold text-lg leading-snug">{t.name}</h2>
                  {joined ? <Badge variant="success">You&rsquo;re in</Badge> : full ? <Badge variant="neutral">Full</Badge> : null}
                </div>
                <ul className="text-sm text-[var(--color-muted-foreground)] space-y-1.5">
                  <li className="flex items-center gap-2"><Calendar className="h-4 w-4 shrink-0" aria-hidden />Starts {formatDateTime(t.startDate)}</li>
                  <li className="flex items-center gap-2"><CircleDot className="h-4 w-4 shrink-0" aria-hidden />{oversLabel(t.overs)}</li>
                  <li className="flex items-center gap-2"><Timer className="h-4 w-4 shrink-0" aria-hidden />Each round lasts {formatRoundLength(t.roundDurationMinutes)}</li>
                  <li className="flex items-center gap-2"><Users className="h-4 w-4 shrink-0" aria-hidden />{t.registrationCount ?? 0}{t.maxPlayers ? ` of ${t.maxPlayers}` : ''} players</li>
                  {t.buybackPriceCents >= 50 && (
                    <li className="flex items-center gap-2"><RotateCcw className="h-4 w-4 shrink-0" aria-hidden />Out in round 1? Buy back in for {formatMoneyCents(t.buybackPriceCents)}</li>
                  )}
                </ul>
                {!full && (
                  <span className="text-sm font-medium text-[var(--color-primary)]">
                    {joined ? 'Change where you play →' : 'Choose this tournament →'}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {hasTournaments && (
        <Link to="/my-tournaments" className={buttonVariants({ variant: 'outline' })}>
          ← Back to my tournaments
        </Link>
      )}
    </div>
  );
}
