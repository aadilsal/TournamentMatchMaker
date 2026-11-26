import { Link, Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BuybackOption, PlayerCardTournament, PlayerDashboard, Tournament } from '@vr-tournament/shared';
import { LiveNow, NextUp, OpenToJoin, RecentForm, StatStrip, TierProgress } from '@/components/dashboard/DashboardPanels';
import { oversLabel } from '@vr-tournament/shared';
import { Headset, MapPin, Plus, Target, Trophy, Swords } from 'lucide-react';
import { apiDelete, apiGet, getAccessToken, getUserErrorMessage } from '@/lib/api';
import { JOURNEY_KEYS, useJourney, useMyTournaments } from '@/lib/journey';
import { MetaLinkCodeDisplay } from '@/components/meta/MetaLinkCodeDisplay';
import { PhoneAppCard } from '@/components/pwa/PhoneAppCard';
import { BuybackButton } from '@/components/tournament/BuybackButton';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { ListSkeleton } from '@/components/ui/skeleton';
import { QueryError } from '@/components/ui/query-error';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toast } from '@/components/ui/toast';

const STATUS_BADGE: Record<PlayerCardTournament['status'], { label: string; variant: 'info' | 'success' | 'neutral' }> = {
  upcoming: { label: 'Starts soon', variant: 'info' },
  live: { label: 'Live', variant: 'success' },
  finished: { label: 'Finished', variant: 'neutral' },
};

/** Step 3 and home: every tournament the player is in, each saying what to do next. */
export function MyTournamentsPage() {
  const loggedIn = !!getAccessToken();
  const { data: card, isLoading, error, refetch } = useMyTournaments();
  const journey = useJourney();
  const buybacks = useQuery({
    queryKey: ['buyback-options'],
    queryFn: () => apiGet<BuybackOption[]>('/players/me/buyback-options'),
    enabled: loggedIn,
    refetchInterval: 30_000,
  });
  const dashboard = useQuery({
    queryKey: ['player-dashboard'],
    queryFn: () => apiGet<PlayerDashboard>('/players/me/dashboard'),
    enabled: loggedIn,
    refetchInterval: 60_000,
  });

  if (!loggedIn) return <Navigate to="/login?returnTo=%2Fmy-tournaments" replace />;
  if (isLoading) return <ListSkeleton count={3} />;
  if (error || !card) return <QueryError error={error} resource="your tournaments" onRetry={() => refetch()} />;
  if (card.tournaments.length === 0 && journey.data?.step === 'choose_tournament') return <Navigate to="/join" replace />;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{card.greeting}</h1>
          <p className="text-[var(--color-muted-foreground)] mt-1">
            {card.skillTierLabel} · {card.record.wins} won · {card.record.losses} lost
          </p>
        </div>
        <Link to="/join" title="Browse open tournaments and join one" className={buttonVariants({ variant: 'outline', className: 'gap-1.5' })}>
          <Plus className="h-4 w-4" aria-hidden />
          Join another tournament
        </Link>
      </header>

      <NextUp tournaments={card.tournaments} />
      {dashboard.data && <StatStrip stats={dashboard.data.stats} />}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2 space-y-4" aria-label="My tournaments">
          <h2 className="text-lg font-semibold">My tournaments</h2>
          {card.tournaments.length === 0 ? (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 text-center">
              <p className="font-semibold">You&rsquo;re not in a tournament right now.</p>
              {journey.data?.step === 'choose_tournament' || (dashboard.data?.openTournaments.length ?? 0) > 0 ? (
                <Link to="/join" className={buttonVariants({ className: 'mt-4' })}>Choose a tournament</Link>
              ) : (
                <>
                  <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
                    No tournaments are open to join right now. New ones will show up here as soon as they open.
                  </p>
                  <Link to="/leaderboards" className={buttonVariants({ variant: 'outline', className: 'mt-4' })}>See the leaderboards</Link>
                </>
              )}
            </div>
          ) : (
            card.tournaments.map((t) => (
              <TournamentCard key={t.id} t={t} buyback={buybacks.data?.find((b) => b.tournamentId === t.id) ?? null} />
            ))
          )}
        </section>

        <aside className="space-y-3">
          {dashboard.data && (
            <>
              <TierProgress stats={dashboard.data.stats} />
              <RecentForm d={dashboard.data} />
              <LiveNow d={dashboard.data} />
              <OpenToJoin d={dashboard.data} />
            </>
          )}
          <PhoneAppCard />
          <MetaLinkCodeDisplay />
          <p className="text-xs text-[var(--color-muted-foreground)] px-1">
            Playing in VR — at home or at an arena? Type this code into the Quest app once so your scores land on your account.
          </p>
        </aside>
      </div>
    </div>
  );
}

function TournamentCard({ t, buyback }: { t: PlayerCardTournament; buyback: BuybackOption | null }) {
  const queryClient = useQueryClient();
  const askConfirm = useConfirm();
  const badge = STATUS_BADGE[t.status];
  const leave = useMutation({
    mutationFn: () => apiDelete(`/tournaments/${t.id}/join`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: JOURNEY_KEYS.myTournaments });
      void queryClient.invalidateQueries({ queryKey: JOURNEY_KEYS.journey });
      toast.success(`You've left ${t.name}.`);
    },
    onError: (err) => toast.error(getUserErrorMessage(err)),
  });

  const onLeave = async () => {
    const ok = await askConfirm({
      title: `Leave ${t.name}?`,
      description: 'Your place goes back to other players. You can join again until it starts.',
      confirmLabel: 'Leave',
      cancelLabel: 'Stay in',
      tone: 'danger',
    });
    if (ok) leave.mutate();
  };

  const m = t.match;
  const score = (n: number) => (n >= 0 ? String(n) : '–');

  return (
    <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-lg leading-snug">{t.name}</h2>
          <p className="text-xs font-medium text-[var(--color-primary)] mt-0.5">{oversLabel(t.overs)}</p>
          {t.playingAt && (
            <p className="text-sm text-[var(--color-muted-foreground)] flex items-center gap-1.5 mt-0.5">
              {t.playingAt.type === 'home' ? <Headset className="h-3.5 w-3.5" aria-hidden /> : <MapPin className="h-3.5 w-3.5" aria-hidden />}
              {t.playingAt.type === 'home' ? 'Playing from home' : `${t.playingAt.name}${t.playingAt.city ? `, ${t.playingAt.city}` : ''}`}
            </p>
          )}
        </div>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>

      <p className="text-base font-medium flex items-start gap-2">
        {t.myStatus === 'champion' && <Trophy className="h-5 w-5 shrink-0 text-[var(--color-primary)]" aria-hidden />}
        {t.statusText}
      </p>

      {m && (
        <div className="rounded-lg border border-[var(--color-border)] p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-medium">
              <Swords className="h-4 w-4 text-[var(--color-primary)]" aria-hidden />
              vs {m.opponent}
            </span>
            {m.state === 'your_turn' && m.opponentScore < 0 && <Badge variant="success">You bat first — set the target in the Quest app</Badge>}
            {m.state === 'waiting_for_opponent' && <Badge variant="info">You scored {score(m.myScore)} — {m.opponent} needs {m.myScore + 1}</Badge>}
            {m.state === 'decided' && <Badge variant="neutral">You {score(m.myScore)} – {score(m.opponentScore)} {m.opponent}</Badge>}
          </div>
          {/* The opponent has batted: the chase is the one thing to show. */}
          {m.state === 'your_turn' && m.opponentScore >= 0 && (
            <div className="flex items-center gap-4 rounded-lg border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 px-4 py-3">
              <Target className="h-8 w-8 shrink-0 text-[var(--color-primary)]" aria-hidden />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">Target to chase</p>
                <p className="text-2xl font-extrabold leading-tight">{m.opponentScore + 1} to win</p>
                <p className="text-sm text-[var(--color-muted-foreground)]">{m.opponent} scored {m.opponentScore}. Play your innings in the Quest app.</p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {t.myStatus === 'registered' && (
          <>
            <Link to={`/join/${t.id}`} title="Pick a different venue, or Home" className={buttonVariants({ variant: 'outline', size: 'sm' })}>Change where I play</Link>
            <Button variant="outline" size="sm" tooltip="Leave this tournament; you can join again until it starts" onClick={onLeave} disabled={leave.isPending}>
              {leave.isPending ? 'Leaving…' : 'Leave tournament'}
            </Button>
          </>
        )}
        {t.myStatus === 'knocked_out' && buyback && (
          <BuybackButton
            tournamentId={t.id}
            tournament={{ id: t.id, name: t.name, buybackPriceCents: buyback.buybackPriceCents } as Tournament}
            onSuccess={() => void queryClient.invalidateQueries({ queryKey: JOURNEY_KEYS.myTournaments })}
          />
        )}
        <Link to={`/tournaments/${t.id}`} title="See fixtures, live matches, players and stats" className={buttonVariants({ variant: 'outline', size: 'sm' })}>Tournament details</Link>
      </div>
    </article>
  );
}
