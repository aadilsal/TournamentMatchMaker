import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { GlobalLeaderboards, LeaderboardEntry } from '@vr-tournament/shared';
import { WICKETS_MIN_INNINGS_ALL_TIME } from '@vr-tournament/shared';
import { BarChart3, Flame, Medal, Shield, Target, Trophy } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { ListSkeleton } from '@/components/ui/skeleton';
import { QueryError } from '@/components/ui/query-error';
import { cn } from '@/lib/utils';

function Board({ title, hint, icon: Icon, entries, unit }: { title: string; hint: string; icon: typeof Trophy; entries: LeaderboardEntry[]; unit: string }) {
  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 space-y-3">
      <div>
        <h2 className="flex items-center gap-2 font-semibold"><Icon className="h-4 w-4 text-[var(--color-primary)]" aria-hidden />{title}</h2>
        <p className="text-xs text-[var(--color-muted-foreground)]">{hint}</p>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">Fills in as innings report it from the headset.</p>
      ) : (
        <ol className="space-y-1.5">
          {entries.map((e, i) => (
            <li key={`${e.userId}-${i}`} className={cn('flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm', i === 0 && 'bg-[var(--color-primary)]/10')}>
              <span className="flex min-w-0 items-center gap-2">
                <span className={cn('w-5 text-center tabular-nums font-semibold', i < 3 ? 'text-[var(--color-primary)]' : 'text-[var(--color-muted-foreground)]')}>{i + 1}</span>
                <Link to={`/players/${encodeURIComponent(e.username)}`} className="truncate hover:underline">{e.username}</Link>
              </span>
              <span className="tabular-nums font-semibold">
                {e.value}
                <span className="ml-1 text-xs font-normal text-[var(--color-muted-foreground)]">{unit}</span>
                {e.wickets != null && (
                  <span className="block text-right text-[11px] font-normal text-[var(--color-muted-foreground)]">{e.wickets} wkts · {e.overs} ov</span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** All-time leaderboards across every tournament. */
export function LeaderboardsPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['leaderboards'],
    queryFn: () => apiGet<GlobalLeaderboards>('/leaderboards'),
    staleTime: 60_000,
  });
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight"><Medal className="h-7 w-7 text-[var(--color-primary)]" aria-hidden />Leaderboards</h1>
        <p className="mt-1 text-[var(--color-muted-foreground)]">All-time, across every VR Cricket League tournament.</p>
      </header>
      {isLoading ? (
        <ListSkeleton count={4} />
      ) : error || !data ? (
        <QueryError error={error} resource="leaderboards" onRetry={() => refetch()} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Board title="Most 6s" hint="Total sixes hit" icon={Flame} entries={data.batting.mostSixes} unit="6s" />
          <Board title="Most 4s" hint="Total fours hit" icon={Flame} entries={data.batting.mostFours} unit="4s" />
          <Board
            title="Fewest wickets per over"
            hint={`Wickets lost per over batted; at least ${WICKETS_MIN_INNINGS_ALL_TIME} innings`}
            icon={Shield}
            entries={data.batting.fewestWicketsPerOver}
            unit="/ over"
          />
          <Board title="Most runs" hint="Total runs scored" icon={Target} entries={data.batting.mostRuns} unit="runs" />
          <Board title="Highest innings" hint="Best single innings" icon={Trophy} entries={data.batting.highestInnings} unit="runs" />
          <Board title="Top rated" hint="Rating points from match results" icon={BarChart3} entries={data.topRated} unit="pts" />
        </div>
      )}
    </div>
  );
}
