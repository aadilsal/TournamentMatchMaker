import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Tournament, Venue } from '@vr-tournament/shared';
import { oversLabel } from '@vr-tournament/shared';
import { Headset, MapPin, Check } from 'lucide-react';
import { apiGet, apiPost, getAccessToken, getUserErrorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { JOURNEY_KEYS, useMyTournaments } from '@/lib/journey';
import { useAuthUser } from '@/hooks/useAuthUser';
import { JourneySteps } from '@/components/journey/JourneySteps';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { GridSkeleton } from '@/components/ui/skeleton';
import { QueryError } from '@/components/ui/query-error';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

type Choice = { home: true } | { venueId: string };

/** Step 2: where the player plays this tournament — a venue, or Home for headset owners. */
export function ChooseWherePage() {
  const { tournamentId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const loggedIn = !!getAccessToken();
  const { user, isLoading: userLoading } = useAuthUser();
  const mine = useMyTournaments();
  const [choice, setChoice] = useState<Choice | null>(null);

  const tournament = useQuery({
    queryKey: ['tournament', tournamentId],
    queryFn: () => apiGet<Tournament>(`/tournaments/${tournamentId}`),
    enabled: loggedIn && !!tournamentId,
  });

  const coords = user?.latitude != null && user?.longitude != null ? { lat: user.latitude, lng: user.longitude } : null;
  const venues = useQuery({
    queryKey: ['venues', 'for-join', coords],
    queryFn: () => apiGet<Venue[]>(coords ? `/venues?lat=${coords.lat}&lng=${coords.lng}` : '/venues'),
    enabled: loggedIn,
  });

  const current = mine.data?.tournaments.find((t) => t.id === tournamentId)?.playingAt ?? null;
  useEffect(() => {
    if (choice || !current) return;
    setChoice(current.type === 'home' ? { home: true } : { venueId: current.id });
  }, [current, choice]);

  const join = useMutation({
    mutationFn: (body: Choice) => apiPost<{ created: boolean }>(`/tournaments/${tournamentId}/join`, body),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: JOURNEY_KEYS.myTournaments });
      void queryClient.invalidateQueries({ queryKey: JOURNEY_KEYS.journey });
      void queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      toast.success(result.created ? `You're in ${tournament.data?.name ?? 'the tournament'}!` : 'Saved — your place to play is updated.');
      navigate('/my-tournaments');
    },
    onError: (err) => toast.error(getUserErrorMessage(err)),
  });

  if (!loggedIn) return <Navigate to={`/register?returnTo=${encodeURIComponent(`/join/${tournamentId}`)}`} replace />;
  if (tournament.isLoading || userLoading) return <GridSkeleton cols={2} count={2} />;
  if (tournament.isError) {
    return <QueryError error={tournament.error} resource="tournament" onRetry={() => tournament.refetch()} backTo={{ href: '/join', label: 'Choose another tournament' }} />;
  }

  const t = tournament.data;
  const joinable = !!t && t.playFormat === 'draw' && t.status === 'open' && new Date(t.startDate).getTime() > Date.now();
  if (!t || !joinable) {
    return (
      <EmptyState
        title="This tournament isn't taking players right now"
        description="It may have started already. Pick another tournament to play."
        action={{ label: 'Choose a tournament', href: '/join' }}
      />
    );
  }

  const isHome = (c: Choice | null) => !!c && 'home' in c;
  const isVenue = (c: Choice | null, id: string) => !!c && 'venueId' in c && c.venueId === id;
  const chosenName = !choice
    ? null
    : 'home' in choice
      ? 'Home'
      : venues.data?.find((v) => v.id === choice.venueId)?.name ?? 'this venue';

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-24">
      <JourneySteps current={1} />
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Where will you play {t.name}?</h1>
        <p className="text-sm font-medium text-[var(--color-primary)] mt-1">{oversLabel(t.overs)}</p>
        <p className="text-[var(--color-muted-foreground)] mt-1">
          {user?.hasVrHeadset
            ? 'Play at an arena near you, or from home on your own VR headset.'
            : 'Pick the arena where you will play your matches.'}{' '}
          You can change this until it starts on {formatDateTime(t.startDate)}.
        </p>
      </header>

      {venues.isLoading ? (
        <GridSkeleton cols={2} count={4} />
      ) : venues.isError ? (
        <QueryError error={venues.error} resource="venues" onRetry={() => venues.refetch()} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Where you play">
          {user?.hasVrHeadset && (
            <PlaceOption
              selected={isHome(choice)}
              onSelect={() => setChoice({ home: true })}
              icon={<Headset className="h-5 w-5" aria-hidden />}
              title="Home"
              subtitle="Play on your own VR headset, wherever you are"
            />
          )}
          {(venues.data ?? []).filter((v) => v.active).map((v) => (
            <PlaceOption
              key={v.id}
              selected={isVenue(choice, v.id)}
              onSelect={() => setChoice({ venueId: v.id })}
              icon={<MapPin className="h-5 w-5" aria-hidden />}
              title={v.name}
              subtitle={`${v.address ? `${v.address}, ` : ''}${v.city}${v.distanceM != null ? ` · ${(v.distanceM / 1000).toFixed(1)} km away` : ''}`}
            />
          ))}
          {!user?.hasVrHeadset && (venues.data ?? []).length === 0 && (
            <p className="text-sm text-[var(--color-muted-foreground)]">No arenas are open yet. Check back soon.</p>
          )}
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-border)] bg-[var(--color-card)]/95 backdrop-blur px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <Link to="/join" className="text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
            ← Another tournament
          </Link>
          <Button disabled={!choice || join.isPending} onClick={() => choice && join.mutate(choice)}>
            {join.isPending ? 'Saving…' : current ? `Play at ${chosenName ?? '…'}` : chosenName ? `Join — play at ${chosenName}` : 'Choose where you play'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PlaceOption(props: { selected: boolean; onSelect: () => void; icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={props.selected}
      onClick={props.onSelect}
      className={cn(
        'text-left rounded-xl border p-4 flex items-start gap-3 transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]',
        props.selected
          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
          : 'border-[var(--color-border)] bg-[var(--color-card)] hover:border-[var(--color-primary)]/50'
      )}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
        {props.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{props.title}</span>
        <span className="block text-sm text-[var(--color-muted-foreground)]">{props.subtitle}</span>
      </span>
      {props.selected && <Check className="h-5 w-5 shrink-0 text-[var(--color-primary)]" aria-hidden />}
    </button>
  );
}
