import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueueStatus, Tournament, TournamentRegistration, User, Venue } from '@vr-tournament/shared';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PageLoader } from '@/components/ui/cricket-loader';
import { Trophy, MapPin, Target, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';

type Step = 'tournament' | 'venue' | 'queue';

export function PlayFlowPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('tournament');
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => apiGet<User>('/players/me'),
  });

  const { data: tournamentsData, isLoading: tournamentsLoading } = useQuery({
    queryKey: ['tournaments', profile?.skillTier],
    queryFn: () => apiGet<Tournament[]>(`/tournaments?tier=${profile!.skillTier}&status=open`),
    enabled: !!profile?.skillTier,
  });

  const tournaments = tournamentsData ?? [];

  const { data: venues = [] } = useQuery({
    queryKey: ['venues-play'],
    queryFn: () => apiGet<Venue[]>('/venues?limit=50'),
    enabled: step === 'venue',
  });

  const { data: registration } = useQuery({
    queryKey: ['tournament-registration', selectedTournament?.id],
    queryFn: () =>
      apiGet<TournamentRegistration | null>(`/tournaments/${selectedTournament!.id}/registration`).catch(
        () => null
      ),
    enabled: !!selectedTournament?.id,
  });

  const { data: queueStatus, refetch: refetchQueue } = useQuery({
    queryKey: ['matchmaking-status'],
    queryFn: () => apiGet<QueueStatus>('/matchmaking/status'),
    enabled: step === 'queue',
    refetchInterval: (q) => (q.state.data?.inQueue ? 3000 : false),
  });

  const registerMutation = useMutation({
    mutationFn: (tournamentId: string) =>
      apiPost<TournamentRegistration>(`/tournaments/${tournamentId}/register`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament-registration', selectedTournament?.id] });
    },
  });

  const joinQueue = useMutation({
    mutationFn: () =>
      apiPost<QueueStatus>('/matchmaking/queue', {
        tournamentId: selectedTournament!.id,
        preferredVenueId: selectedVenue!.id,
      }),
    onSuccess: () => refetchQueue(),
  });

  const leaveQueue = useMutation({
    mutationFn: () => apiDelete<QueueStatus>('/matchmaking/queue'),
    onSuccess: () => refetchQueue(),
  });

  if (profileLoading) return <PageLoader label="Loading…" />;

  const steps: Array<{ id: Step; label: string; icon: typeof Trophy }> = [
    { id: 'tournament', label: 'Tournament', icon: Trophy },
    { id: 'venue', label: 'Venue', icon: MapPin },
    { id: 'queue', label: 'Queue', icon: Target },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Play now</h1>
        <p className="text-[var(--color-muted-foreground)] mt-1">
          Tier {profile?.skillTier} · Register → pick venue → join queue
        </p>
      </div>

      <div className="flex gap-2">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const active = step === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                if (s.id === 'venue' && !selectedTournament) return;
                if (s.id === 'queue' && (!selectedTournament || !selectedVenue)) return;
                setStep(s.id);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/30'
                  : 'bg-[var(--color-card)] border border-[var(--color-border)] text-[var(--color-muted-foreground)]'
              }`}
            >
              <Icon className="h-4 w-4" />
              {i + 1}. {s.label}
            </button>
          );
        })}
      </div>

      {step === 'tournament' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
          <h2 className="font-semibold">Choose your tier tournament</h2>
          {tournamentsLoading ? (
            <PageLoader label="Loading tournaments…" />
          ) : tournaments.length === 0 ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              No open tournaments for Tier {profile?.skillTier}.
            </p>
          ) : (
            tournaments.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setSelectedTournament(t);
                  setStep('venue');
                }}
                className={`w-full text-left rounded-xl border p-4 flex items-center justify-between gap-3 transition-colors hover:border-[var(--color-primary)]/50 ${
                  selectedTournament?.id === t.id
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                    : 'border-[var(--color-border)] bg-[var(--color-card)]'
                }`}
              >
                <div>
                  <p className="font-semibold">{t.name}</p>
                  <p className="text-sm text-[var(--color-muted-foreground)]">
                    {t.game} · Tier {t.skillTier} · {t.registrationCount ?? 0} players
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-[var(--color-muted-foreground)]" />
              </button>
            ))
          )}
        </motion.div>
      )}

      {step === 'venue' && selectedTournament && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
          <h2 className="font-semibold">Choose venue for {selectedTournament.name}</h2>
          {venues.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => {
                setSelectedVenue(v);
                setStep('queue');
              }}
              className={`w-full text-left rounded-xl border p-4 flex items-center justify-between gap-3 transition-colors hover:border-[var(--color-primary)]/50 ${
                selectedVenue?.id === v.id
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                  : 'border-[var(--color-border)] bg-[var(--color-card)]'
              }`}
            >
              <div>
                <p className="font-semibold">{v.name}</p>
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  {v.city}, {v.country}
                </p>
              </div>
              <ChevronRight className="h-5 w-5" />
            </button>
          ))}
        </motion.div>
      )}

      {step === 'queue' && selectedTournament && selectedVenue && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 space-y-2">
            <p className="text-sm">
              <span className="text-[var(--color-muted-foreground)]">Tournament:</span>{' '}
              <strong>{selectedTournament.name}</strong>
            </p>
            <p className="text-sm">
              <span className="text-[var(--color-muted-foreground)]">Venue:</span>{' '}
              <strong>{selectedVenue.name}</strong> ({selectedVenue.city})
            </p>
          </div>

          {!registration && (
            <Button
              onClick={() => registerMutation.mutate(selectedTournament.id)}
              disabled={registerMutation.isPending}
              className="w-full"
            >
              {registerMutation.isPending ? 'Registering…' : 'Register for tournament'}
            </Button>
          )}

          {registration && (
            <div className="space-y-3">
              {queueStatus?.inQueue ? (
                <>
                  <p className="text-center text-sm">
                    Position <strong>{queueStatus.position}</strong> of {queueStatus.queueSize}
                  </p>
                  <Button variant="outline" onClick={() => leaveQueue.mutate()} className="w-full">
                    Leave queue
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => joinQueue.mutate()}
                  disabled={joinQueue.isPending}
                  className="w-full"
                  size="lg"
                >
                  {joinQueue.isPending ? 'Joining…' : 'Join matchmaking queue'}
                </Button>
              )}
              <Button variant="ghost" onClick={() => navigate('/matches')} className="w-full">
                View my matches
              </Button>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
