import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { PlayerProfileStats, ProfileTournament } from '@vr-tournament/shared';
import { WICKETS_MIN_INNINGS_ALL_TIME, oversLabel } from '@vr-tournament/shared';
import { Flame, History, Shield, Trophy } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { ListSkeleton } from '@/components/ui/skeleton';
import { QueryError } from '@/components/ui/query-error';
import { StatStrip, TierProgress } from '@/components/dashboard/DashboardPanels';
import { cn } from '@/lib/utils';

const FINISH: Record<ProfileTournament['finish'], { label: (r: number | null) => string; variant: 'success' | 'info' | 'neutral' }> = {
  champion: { label: () => '🏆 Champion', variant: 'success' },
  in: { label: (r) => `Still in · Round ${r ?? 1}`, variant: 'success' },
  registered: { label: () => 'Registered', variant: 'info' },
  out: { label: (r) => (r ? `Out in round ${r}` : 'Out'), variant: 'neutral' },
};

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Trophy; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Icon className="h-5 w-5 text-[var(--color-primary)]" aria-hidden />{title}</h2>
      {children}
    </section>
  );
}

/** Career page body: stats, batting averages, recent innings and tournament history. */
export function PlayerStatsView({ username, showTier = false }: { username: string; showTier?: boolean }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['player-stats', username],
    queryFn: () => apiGet<PlayerProfileStats>(`/players/${encodeURIComponent(username)}/stats`),
    enabled: !!username,
  });
  if (isLoading) return <ListSkeleton count={4} />;
  if (error || !data) return <QueryError error={error} resource="player stats" onRetry={() => refetch()} />;
  const s = data.stats;
  const average = s.innings ? (s.runs / s.innings).toFixed(1) : '—';

  return (
    <div className="space-y-8">
      <StatStrip stats={s} />

      <div className="grid gap-3 sm:grid-cols-3">
        {showTier && <TierProgress stats={s} />}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
          <p className="text-xs text-[var(--color-muted-foreground)]">Batting average</p>
          <p className="text-2xl font-bold tabular-nums">{average}</p>
          <p className="text-xs text-[var(--color-muted-foreground)]">runs per innings</p>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
          <p className="flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)]"><Shield className="h-3.5 w-3.5" aria-hidden />Wickets per over</p>
          <p className="text-2xl font-bold tabular-nums">{s.wicketsPerOver ?? '—'}</p>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            {s.wicketInnings > 0 ? `${s.wicketsLost} wickets in ${s.wicketOvers} overs` : 'Shows once innings report wickets'}
          </p>
          {s.wicketInnings < WICKETS_MIN_INNINGS_ALL_TIME && (
            <p className="mt-1 text-xs text-[var(--color-primary)]">
              {WICKETS_MIN_INNINGS_ALL_TIME - s.wicketInnings} more innings to make the wickets leaderboard
            </p>
          )}
        </div>
      </div>

      <Section title="Recent innings" icon={Flame}>
        {data.recentMatches.length === 0 ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">No innings played yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--color-border)] rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]">
            {data.recentMatches.map((m) => (
              <li key={m.matchId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">
                    vs <Link to={`/players/${encodeURIComponent(m.opponent)}`} className="hover:underline">{m.opponent}</Link>
                  </p>
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    {m.tournamentId ? <Link to={`/tournaments/${m.tournamentId}`} className="hover:underline">{m.tournamentName}</Link> : 'Friendly'} · {formatDate(m.playedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {(m.fours != null || m.sixes != null) && (
                    <span className="text-xs text-[var(--color-muted-foreground)] tabular-nums">
                      {m.fours ?? 0}×4 · {m.sixes ?? 0}×6{m.wicketsLost != null ? ` · ${m.wicketsLost}W` : ''}
                    </span>
                  )}
                  <span className="tabular-nums font-semibold">
                    {m.myScore ?? '–'}<span className="text-[var(--color-muted-foreground)] font-normal"> – {m.opponentScore ?? '–'}</span>
                  </span>
                  <span
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded text-xs font-bold',
                      m.result === 'W' ? 'bg-[var(--color-primary)] text-white' : m.result === 'L' ? 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]' : 'border border-[var(--color-border)] text-[var(--color-muted-foreground)]'
                    )}
                    title={m.result === 'W' ? 'Won' : m.result === 'L' ? 'Lost' : 'In play'}
                  >
                    {m.result ?? '…'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Tournaments" icon={History}>
        {data.tournaments.length === 0 ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">No tournaments yet.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {data.tournaments.map((t) => {
              const finish = FINISH[t.finish];
              return (
                <li key={t.id}>
                  <Link to={`/tournaments/${t.id}`} className="block rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 hover:border-[var(--color-primary)]/50 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold">{t.name}</p>
                      <Badge variant={finish.variant}>{finish.label(t.roundReached)}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{formatDate(t.startDate)} · {oversLabel(t.overs)}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}
