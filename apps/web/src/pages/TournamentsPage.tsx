import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import type { QueuePairFailedEvent, QueueStatus, Tournament } from '@vr-tournament/shared';
import {
  ACTIVE_TOURNAMENT_STATUSES,
  PUBLIC_TOURNAMENT_STATUSES,
} from '@vr-tournament/shared';
import { apiGet, getAccessToken } from '@/lib/api';
import {
  LIVE_QUERY_KEYS,
  LIVE_STALE_TIME,
  SAFETY_POLL_MS,
  queueNeedsPolling,
} from '@/lib/query-keys';
import { useSocketEvent } from '@/hooks/useSocket';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge, tournamentStatusBadge } from '@/components/ui/badge';
import { GridSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { CricketBallLoader } from '@/components/ui/cricket-loader';
import { Trophy, Calendar, Users } from 'lucide-react';
import { motion } from 'motion/react';

const STATUS_FILTERS = [
  {
    value: 'active',
    label: 'Active',
    statuses: ACTIVE_TOURNAMENT_STATUSES,
    emptyTitle: 'No active tournaments',
    emptyDescription: 'Check back soon for new seasons — or view completed ones.',
  },
  {
    value: 'in_progress',
    label: 'Live now',
    statuses: ['in_progress'],
    emptyTitle: 'Nothing live right now',
    emptyDescription: 'No tournament is currently in progress.',
  },
  {
    value: 'open',
    label: 'Open for entry',
    statuses: ['open'],
    emptyTitle: 'No tournaments open',
    emptyDescription: 'Registration is closed everywhere at the moment.',
  },
  {
    value: 'completed',
    label: 'Completed',
    statuses: ['completed'],
    emptyTitle: 'No completed tournaments',
    emptyDescription: 'Finished tournaments will show up here.',
  },
  {
    value: 'all',
    label: 'All',
    statuses: PUBLIC_TOURNAMENT_STATUSES,
    emptyTitle: 'No tournaments yet',
    emptyDescription: 'Check back soon for new seasons.',
  },
] as const satisfies ReadonlyArray<{
  value: string;
  label: string;
  statuses: readonly string[];
  emptyTitle: string;
  emptyDescription: string;
}>;

type StatusFilter = (typeof STATUS_FILTERS)[number]['value'];

export function TournamentsPage() {
  const navigate = useNavigate();
  const isLoggedIn = !!getAccessToken();
  const [queueNotice, setQueueNotice] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');

  const activeFilter =
    STATUS_FILTERS.find((f) => f.value === statusFilter) ?? STATUS_FILTERS[0];
  const statusParam = activeFilter.statuses.join(',');

  const { data: tournaments = [], isLoading } = useQuery({
    queryKey: ['tournaments', statusParam],
    queryFn: () =>
      apiGet<Tournament[]>(`/tournaments?status=${encodeURIComponent(statusParam)}`),
  });

  const { data: queueStatus } = useQuery({
    queryKey: LIVE_QUERY_KEYS.matchmakingStatus,
    queryFn: () => apiGet<QueueStatus>('/matchmaking/status'),
    enabled: isLoggedIn,
    staleTime: LIVE_STALE_TIME,
    refetchInterval: (q) => (queueNeedsPolling(q.state.data) ? SAFETY_POLL_MS : false),
  });

  useSocketEvent('queue:pair_failed', (data: QueuePairFailedEvent) => {
    setQueueNotice(data.message);
  });

  const handleJoin = (tournamentId: string) => {
    if (!isLoggedIn) {
      navigate(`/register?returnTo=${encodeURIComponent(`/play?tournament=${tournamentId}`)}`);
      return;
    }
    navigate(`/play?tournament=${tournamentId}`);
  };

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/25">
                <Trophy className="h-4.5 w-4.5 text-[var(--color-primary)]" />
              </span>
              <h1 className="text-2xl font-bold tracking-tight">Tournaments</h1>
            </div>
            <p className="text-[var(--color-muted-foreground)] mt-1 ml-11">
              {isLoggedIn
                ? 'Pick a tournament — we match you automatically once you enter.'
                : 'Browse open tournaments. Register to join.'}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)]">
            <span className="shrink-0">Show</span>
            <Select
              className="h-9 w-auto min-w-[9.5rem]"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              aria-label="Filter tournaments by status"
            >
              {STATUS_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </motion.div>

      {isLoggedIn && queueStatus?.inQueue && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 p-5 flex items-center gap-4"
        >
          <CricketBallLoader size="md" />
          <div>
            <p className="font-semibold">Finding opponent…</p>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              {queueNotice ??
                (queueStatus.queueSize && queueStatus.queueSize > 1
                  ? `${queueStatus.queueSize} players in queue — matching now…`
                  : "Waiting for another player to join…")}
            </p>
          </div>
        </motion.div>
      )}

      {isLoading ? (
        <GridSkeleton cols={2} count={4} />
      ) : tournaments.length === 0 ? (
        <EmptyState
          icon={<Trophy className="h-12 w-12" />}
          title={activeFilter.emptyTitle}
          description={activeFilter.emptyDescription}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {tournaments.map((t, i) => {
            const { label, variant } = tournamentStatusBadge(t.status);
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, delay: i * 0.05 }}
              >
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 flex flex-col gap-4 hover:border-[var(--color-primary)]/50 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-base">{t.name}</h3>
                      <p className="text-sm text-[var(--color-muted-foreground)] mt-0.5">
                        {t.game} · Tier {t.skillTier}
                      </p>
                    </div>
                    <Badge variant={variant}>{label}</Badge>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-[var(--color-muted-foreground)]">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(t.startDate).toLocaleDateString()} – {new Date(t.endDate).toLocaleDateString()}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" />
                      {t.registrationCount ?? 0}{t.maxPlayers ? ` / ${t.maxPlayers}` : ''} registered
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <Link to={`/tournaments/${t.id}`} className="flex-1">
                      <Button size="sm" variant="outline" className="w-full">Details</Button>
                    </Link>
                    {t.status === 'open' && (
                      <Button size="sm" className="flex-1" onClick={() => handleJoin(t.id)}>
                        {isLoggedIn ? 'Join' : 'Register to join'}
                      </Button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
