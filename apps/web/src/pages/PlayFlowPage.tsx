import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { TimeSlot, Tournament, TournamentRound, User, Venue } from '@vr-tournament/shared';
import { isSlotWithinWindow } from '@vr-tournament/shared';
import { apiGet, apiPost, getAccessToken } from '@/lib/api';
import { LIVE_STALE_TIME, SAFETY_POLL_MS } from '@/lib/query-keys';
import { getUserErrorMessage } from '@/lib/user-messages';
import { Button } from '@/components/ui/button';
import { DetailPageSkeleton } from '@/components/ui/route-fallback';
import { MapPin, Clock, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { SlotConfirmModal, type EnterTournamentResult } from '@/components/tournament/SlotConfirmModal';
import { SlotPicker, todayString } from '@/components/slots/SlotPicker';

type Step = 'venue' | 'slot';

export function PlayFlowPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tournamentId = searchParams.get('tournament');

  const [step, setStep] = useState<Step>('venue');
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayString());
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) navigate('/login');
    if (!tournamentId) navigate('/tournaments');
  }, [navigate, tournamentId]);

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: () => apiGet<User>('/players/me'),
    enabled: !!getAccessToken(),
  });

  const { data: tournament, isLoading: tournamentLoading } = useQuery({
    queryKey: ['tournament', tournamentId],
    queryFn: () => apiGet<Tournament>(`/tournaments/${tournamentId}`),
    enabled: !!tournamentId,
  });

  const { data: rounds = [] } = useQuery({
    queryKey: ['tournament-rounds', tournamentId],
    queryFn: () => apiGet<TournamentRound[]>(`/tournaments/${tournamentId}/rounds`),
    enabled: !!tournamentId,
  });

  const activeRound = useMemo(
    () =>
      rounds.find(
        (round) =>
          round.roundNumber === tournament?.currentRoundNumber && round.status === 'active'
      ) ?? null,
    [rounds, tournament?.currentRoundNumber]
  );

  const { data: venues = [] } = useQuery({
    queryKey: ['venues-play'],
    queryFn: () => apiGet<Venue[]>('/venues?limit=50'),
    enabled: !profile?.hasVrHeadset,
  });

  const { data: slots = [], isLoading: slotsLoading } = useQuery({
    queryKey: ['slots', selectedVenue?.id, selectedDate],
    queryFn: () => apiGet<TimeSlot[]>(`/venues/${selectedVenue!.id}/slots?date=${selectedDate}`),
    enabled: !!selectedVenue?.id && step === 'slot',
    staleTime: LIVE_STALE_TIME,
    refetchInterval: step === 'slot' ? SAFETY_POLL_MS : false,
  });

  const bookableSlots = useMemo(() => {
    if (!activeRound) return slots;
    return slots.filter((slot) =>
      isSlotWithinWindow(slot.startTime, slot.endTime, activeRound.startsAt, activeRound.endsAt)
    );
  }, [slots, activeRound]);

  const enterMutation = useMutation({
    mutationFn: () =>
      apiPost<EnterTournamentResult>(`/tournaments/${tournamentId}/enter`, {
        venueId: selectedVenue!.id,
        timeSlotId: selectedSlot!.id,
      }),
    onSuccess: () => {
      setShowConfirm(false);
      navigate('/bookings');
    },
  });

  const vrEnterMutation = useMutation({
    mutationFn: () => apiPost<EnterTournamentResult>(`/tournaments/${tournamentId}/enter`, {}),
    onSuccess: () => navigate('/tournaments'),
  });

  if (tournamentLoading || !tournament) return <DetailPageSkeleton />;

  if (profile?.hasVrHeadset) {
    return (
      <div className="max-w-lg mx-auto space-y-6 text-center">
        <div>
          <h1 className="text-2xl font-bold">{tournament.name}</h1>
          <p className="text-[var(--color-muted-foreground)] mt-1">
            You&apos;re ready with your VR headset — no venue booking needed.
          </p>
        </div>
        <Button
          size="lg"
          className="w-full"
          onClick={() => vrEnterMutation.mutate()}
          disabled={vrEnterMutation.isPending}
        >
          {vrEnterMutation.isPending ? 'Finding match…' : 'Find my match'}
        </Button>
        {vrEnterMutation.isError && (
          <p className="text-sm text-[var(--color-destructive)]">{getUserErrorMessage(vrEnterMutation.error)}</p>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Join {tournament.name}</h1>
        <p className="text-[var(--color-muted-foreground)] mt-1">
          Pick a venue and time slot — we&apos;ll book and find your opponent automatically.
        </p>
      </div>

      <div className="flex gap-2">
        {(['venue', 'slot'] as Step[]).map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              if (s === 'slot' && !selectedVenue) return;
              setStep(s);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              step === s
                ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/30'
                : 'bg-[var(--color-card)] border border-[var(--color-border)] text-[var(--color-muted-foreground)]'
            }`}
          >
            {i + 1}. {s === 'venue' ? 'Venue' : 'Slot'}
          </button>
        ))}
      </div>

      {step === 'venue' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <MapPin className="h-4 w-4" /> Choose venue
          </h2>
          {venues.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => {
                setSelectedVenue(v);
                setStep('slot');
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

      {step === 'slot' && selectedVenue && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <h2 className="font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4" /> Choose slot at {selectedVenue.name}
          </h2>

          <SlotPicker
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            slots={bookableSlots}
            isLoading={slotsLoading}
            selectedSlotId={selectedSlot?.id}
            onSlotSelect={(slot) => {
              setSelectedSlot(slot);
              setShowConfirm(true);
            }}
            emptyMessage={
              activeRound && slots.length > 0 && bookableSlots.length === 0
                ? 'No slots on this date fall within the current tournament round. Try another day.'
                : undefined
            }
          />
        </motion.div>
      )}

      <SlotConfirmModal
        open={showConfirm && !!selectedSlot && !!selectedVenue}
        tournamentName={tournament.name}
        venueName={selectedVenue?.name ?? ''}
        slotStart={selectedSlot?.startTime ?? ''}
        slotEnd={selectedSlot?.endTime ?? ''}
        onConfirm={() => enterMutation.mutate()}
        onCancel={() => {
          setShowConfirm(false);
          enterMutation.reset();
        }}
        isPending={enterMutation.isPending}
        error={enterMutation.isError ? getUserErrorMessage(enterMutation.error) : null}
      />
    </div>
  );
}
