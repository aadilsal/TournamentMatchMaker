import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import type {
  QueuePairFailedEvent,
  QueueStatus,
  QueueUpdatedEvent,
  Tournament,
  User,
} from '@vr-tournament/shared';
import { apiGet, getAccessToken } from '@/lib/api';
import {
  LIVE_QUERY_KEYS,
  LIVE_STALE_TIME,
  SAFETY_POLL_MS,
  queueNeedsPolling,
} from '@/lib/query-keys';
import { useSocketEvent } from '@/hooks/useSocket';
import { Button, buttonVariants } from '@/components/ui/button';
import { QueryError } from '@/components/ui/query-error';
import { formatDate } from '@/lib/format';
import { Badge, tournamentStatusBadge } from '@/components/ui/badge';
import { Tabs } from '@/components/ui/tabs';
import { GridSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { CricketBallLoader } from '@/components/ui/cricket-loader';
import { Trophy, Calendar, Users, Info } from 'lucide-react';
import { motion } from 'motion/react';
import { oversLabel } from '@vr-tournament/shared';
import { Crown } from 'lucide-react';

type TournamentView = 'active' | 'completed';

export function TournamentsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isLoggedIn = !!getAccessToken();
  const [queueNotice, setQueueNotice] = useState<string | null>(null);
  // Finished seasons are noise on the default view — they stay one click away.
  const [view, setView] = useState<TournamentView>('active');

  const { data: tournaments = [], isLoading, error, refetch } = useQuery({
    queryKey: ['tournaments'],
    queryFn: () => apiGet<Tournament[]>('/tournaments'),
  });

  const { active, completed } = useMemo(
    () => ({
      // 'closed' means registration is shut, not that the tournament is over —
      // it still has to be played, so it stays under Live & upcoming.
      active: tournaments.filter((t) => t.status !== 'completed'),
      completed: tournaments.filter((t) => t.status === 'completed'),
    }),
    [tournaments]
  );

  const visible = view === 'completed' ? completed : active;

  const { data: queueStatus } = useQuery({
    queryKey: LIVE_QUERY_KEYS.matchmakingStatus,
    queryFn: () => apiGet<QueueStatus>('/matchmaking/status'),
    enabled: isLoggedIn,
    staleTime: LIVE_STALE_TIME,
    refetchInterval: (q) => (queueNeedsPolling(q.state.data) ? SAFETY_POLL_MS : false),
  });

  // A player may hold a place in only one unfinished tournament at a time. The
  // API enforces it either way; reading it here means we can say so up front
  // instead of letting them click Join and take a 409.
  const { data: me } = useQuery({
    queryKey: LIVE_QUERY_KEYS.me,
    queryFn: () => apiGet<User>('/players/me'),
    enabled: isLoggedIn,
    staleTime: LIVE_STALE_TIME,
  });
  const liveTournament = me?.liveTournament ?? null;

  useSocketEvent('queue:pair_failed', (data: QueuePairFailedEvent) => {
    setQueueNotice(data.message);
  });

  // Leaving the queue happens to the player, not because of anything they did
  // here — the round closed, or the tournament finished. Take the server's word
  // for it immediately instead of leaving "Finding opponent…" on screen until
  // the next safety poll.
  useSocketEvent('queue:updated', (data: QueueUpdatedEvent) => {
    queryClient.setQueryData(LIVE_QUERY_KEYS.matchmakingStatus, (prev: QueueStatus | undefined) =>
      prev ? { ...prev, ...data } : prev
    );
    if (!data.inQueue) setQueueNotice(null);
    void queryClient.invalidateQueries({ queryKey: LIVE_QUERY_KEYS.matchmakingStatus });
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
      </motion.div>

      {isLoggedIn && liveTournament && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 flex items-start gap-3"
        >
          <Info className="h-4.5 w-4.5 mt-0.5 shrink-0 text-[var(--color-primary)]" />
          <div className="min-w-0">
            <p className="text-sm font-medium">
              You&rsquo;re already playing in{' '}
              <Link
                to={`/tournaments/${liveTournament.id}`}
                className="text-[var(--color-primary)] hover:underline"
              >
                {liveTournament.name}
              </Link>
            </p>
            <p className="text-sm text-[var(--color-muted-foreground)] mt-0.5">
              You can join another tournament once this one finishes, or if you withdraw from it.
            </p>
          </div>
        </motion.div>
      )}

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

      {!isLoading && tournaments.length > 0 && (
        <Tabs
          active={view}
          onChange={(id) => setView(id as TournamentView)}
          tabs={[
            { id: 'active', label: `Live & upcoming (${active.length})` },
            { id: 'completed', label: `Completed (${completed.length})` },
          ]}
        />
      )}

      {isLoading ? (
        <GridSkeleton cols={2} count={4} />
      ) : error ? (
        <QueryError error={error} resource="tournaments" onRetry={() => refetch()} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Trophy className="h-12 w-12" />}
          title={view === 'completed' ? 'No completed tournaments' : 'No live or upcoming tournaments'}
          description={
            view === 'completed'
              ? 'Finished seasons will show up here.'
              : 'Check back soon for new seasons.'
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visible.map((t, i) => {
            if (t.status === 'completed') return <CompletedTournamentCard key={t.id} t={t} i={i} />;
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
                      {formatDate(t.startDate)} – {formatDate(t.endDate)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" />
                      {t.registrationCount ?? 0}{t.maxPlayers ? ` / ${t.maxPlayers}` : ''} registered
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <Link
                      to={`/tournaments/${t.id}`}
                      className={buttonVariants({ variant: 'outline', className: 'flex-1' })}
                    >
                      Details
                    </Link>
                    {t.status === 'open' &&
                      (() => {
                        const blocked = !!liveTournament && liveTournament.id !== t.id;
                        // The tournament they are already in still offers a way
                        // back in, but it must not say "Join". Reading the same
                        // word after joining is indistinguishable from the join
                        // having failed, and the next click walks back through a
                        // flow they have already completed.
                        const alreadyIn = !!liveTournament && liveTournament.id === t.id;
                        return (
                          <Button
                            className="flex-1"
                            variant={alreadyIn ? 'secondary' : 'default'}
                            disabled={blocked}
                            title={
                              blocked
                                ? `You're already playing in ${liveTournament!.name}`
                                : undefined
                            }
                            onClick={() => handleJoin(t.id)}
                          >
                            {!isLoggedIn
                              ? 'Register to join'
                              : blocked
                                ? 'Already playing'
                                : alreadyIn
                                  ? "You're in — continue"
                                  : 'Join'}
                          </Button>
                        );
                      })()}
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

/** A finished tournament: who won, the format, the field size and when it ran. */
function CompletedTournamentCard({ t, i }: { t: Tournament; i: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, delay: i * 0.05 }}>
      <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] transition-colors hover:border-amber-400/40">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent px-5 py-3">
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-300">
            <Trophy className="h-4 w-4" aria-hidden /> Finished
          </span>
          <span className="text-xs text-[var(--color-muted-foreground)]">{formatDate(t.endDate)}</span>
        </div>
        <div className="flex flex-1 flex-col gap-4 p-5">
          <h3 className="text-lg font-semibold leading-snug">{t.name}</h3>
          {t.championName ? (
            <Link
              to={`/players/${encodeURIComponent(t.championName)}`}
              title="See the champion's profile"
              className="flex items-center gap-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 transition-colors hover:bg-amber-400/15"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-400/20 text-amber-300"><Crown className="h-5 w-5" aria-hidden /></span>
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-amber-300">Champion</span>
                <span className="block truncate font-semibold">{t.championName}</span>
              </span>
            </Link>
          ) : (
            <p className="rounded-lg border border-[var(--color-border)] px-3 py-2.5 text-sm text-[var(--color-muted-foreground)]">No champion: the final was not played.</p>
          )}
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-[var(--color-border)] px-2.5 py-1">{oversLabel(t.overs)}</span>
            <span className="flex items-center gap-1 rounded-full border border-[var(--color-border)] px-2.5 py-1"><Users className="h-3 w-3" aria-hidden />{t.registrationCount ?? 0} {(t.registrationCount ?? 0) === 1 ? 'player' : 'players'}</span>
            <span className="flex items-center gap-1 rounded-full border border-[var(--color-border)] px-2.5 py-1"><Calendar className="h-3 w-3" aria-hidden />{formatDate(t.startDate)} – {formatDate(t.endDate)}</span>
          </div>
          <Link
            to={`/tournaments/${t.id}`}
            title="See every round, result and the tournament stats"
            className={buttonVariants({ variant: 'outline', className: 'mt-auto w-full' })}
          >
            View results
          </Link>
        </div>
      </article>
    </motion.div>
  );
}
