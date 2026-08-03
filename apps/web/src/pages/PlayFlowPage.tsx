import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  EnterTournamentResult,
  TimeSlot,
  Tournament,
  TournamentRoundSlot,
  User,
  Venue,
} from '@vr-tournament/shared';
import { apiGet, apiPost, getAccessToken } from '@/lib/api';
import { LIVE_STALE_TIME, SAFETY_POLL_MS, invalidateTournamentQueries } from '@/lib/query-keys';
import { getUserErrorMessage } from '@/lib/user-messages';
import { Button } from '@/components/ui/button';
import { DetailPageSkeleton } from '@/components/ui/route-fallback';
import { MapPin, Clock, ChevronRight, Headset } from 'lucide-react';
import { motion } from 'motion/react';
import { SlotConfirmModal } from '@/components/tournament/SlotConfirmModal';
import { SlotPicker, todayString } from '@/components/slots/SlotPicker';

type Step = 'venue' | 'slot';

type SlotOption = TimeSlot & {
  venue: { id: string; name: string; city: string; address: string };
};

interface SlotOptionsResponse {
  roundNumber: number;
  requiresVenue: boolean;
  round: { startsAt: string; endsAt: string } | null;
  defaultTimeSlotId: string | null;
  previousSlot: TournamentRoundSlot | null;
  slots: SlotOption[];
}

export function PlayFlowPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const tournamentId = searchParams.get('tournament');

  const [step, setStep] = useState<Step>('venue');
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayString());
  const [selectedSlot, setSelectedSlot] = useState<SlotOption | null>(null);
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

  const hasVr = !!profile?.hasVrHeadset;
  // VR players play from home, so they only pick a time; venue players pick
  // where first, then when.
  const needsVenue = !!profile && !hasVr;

  const { data: venues = [] } = useQuery({
    queryKey: ['venues-play'],
    queryFn: () => apiGet<Venue[]>('/venues?limit=50'),
    enabled: needsVenue,
  });

  // The slot the player already holds in this tournament. Drives the defaults so
  // re-entering for a new round is one click rather than a full re-pick.
  const { data: previousRoundSlot } = useQuery({
    queryKey: ['tournament-my-slot', tournamentId],
    queryFn: () =>
      apiGet<TournamentRoundSlot | null>(`/tournaments/${tournamentId}/my-slot`).catch(() => null),
    enabled: !!tournamentId && !!getAccessToken(),
  });

  // Jump straight to the slot step on the venue the player used last round.
  useEffect(() => {
    if (!needsVenue || selectedVenue || !previousRoundSlot?.venueId) return;
    const venue = venues.find((v) => v.id === previousRoundSlot.venueId);
    if (venue) {
      setSelectedVenue(venue);
      setStep('slot');
    }
  }, [needsVenue, selectedVenue, previousRoundSlot, venues]);

  // Show the day their previous slot falls on so the preselection is visible.
  const [dateInitialised, setDateInitialised] = useState(false);
  useEffect(() => {
    if (dateInitialised || !previousRoundSlot?.slot) return;
    const start = new Date(previousRoundSlot.slot.startTime);
    if (start.getTime() > Date.now()) {
      setSelectedDate(start.toISOString().split('T')[0]!);
    }
    setDateInitialised(true);
  }, [previousRoundSlot, dateInitialised]);

  // Slots are resolved server-side against the current round window, so the
  // list only ever contains slots the player can actually be scheduled into.
  const slotStepReady = hasVr || !!selectedVenue;
  const { data: slotOptions, isLoading: slotsLoading } = useQuery({
    queryKey: ['tournament-slot-options', tournamentId, selectedDate, selectedVenue?.id ?? null],
    queryFn: () => {
      const params = new URLSearchParams({ date: selectedDate });
      if (selectedVenue?.id) params.set('venueId', selectedVenue.id);
      return apiGet<SlotOptionsResponse>(`/tournaments/${tournamentId}/slot-options?${params}`);
    },
    enabled: !!tournamentId && !!profile && slotStepReady,
    staleTime: LIVE_STALE_TIME,
    refetchInterval: SAFETY_POLL_MS,
  });

  const slots = useMemo(() => slotOptions?.slots ?? [], [slotOptions]);
  const previousSlotId = slotOptions?.defaultTimeSlotId ?? previousRoundSlot?.timeSlotId ?? null;

  // Re-entering a later round defaults to the slot the player used last round.
  useEffect(() => {
    if (selectedSlot || !previousSlotId) return;
    const match = slots.find((slot) => slot.id === previousSlotId);
    if (match) setSelectedSlot(match);
  }, [previousSlotId, slots, selectedSlot]);

  // VR players skip the venue step entirely.
  useEffect(() => {
    if (hasVr) setStep('slot');
  }, [hasVr]);

  const enterMutation = useMutation({
    mutationFn: () =>
      apiPost<EnterTournamentResult>(`/tournaments/${tournamentId}/enter`, {
        ...(needsVenue && selectedVenue ? { venueId: selectedVenue.id } : {}),
        timeSlotId: selectedSlot!.id,
      }),
    onSuccess: () => {
      setShowConfirm(false);
      // The registration count on the tournament list, detail page and admin
      // panel all change as a result of this — refresh them immediately rather
      // than leaving a stale "0 registered" behind.
      invalidateTournamentQueries(queryClient, tournamentId ?? undefined);
      navigate(needsVenue ? '/bookings' : '/matches');
    },
  });

  if (tournamentLoading || !tournament || !profile) return <DetailPageSkeleton />;

  const roundNumber = slotOptions?.roundNumber ?? tournament.currentRoundNumber;
  const steps: Step[] = needsVenue ? ['venue', 'slot'] : ['slot'];
  const emptySlotMessage = slotOptions?.round
    ? 'No slots on this date fall within the current tournament round. Try another day.'
    : undefined;

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Join {tournament.name}</h1>
        <p className="text-[var(--color-muted-foreground)] mt-1">
          {hasVr
            ? 'Pick the time you want to play in — we’ll find your opponent for that window.'
            : 'Pick a venue and time slot — we’ll book and find your opponent automatically.'}
        </p>
        <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
          Round {roundNumber}
          {previousSlotId && ' · your previous slot is preselected'}
        </p>
      </div>

      {hasVr && (
        <div className="flex items-start gap-3 rounded-xl border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 p-4">
          <Headset className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-primary)]" />
          <p className="text-sm text-[var(--color-muted-foreground)]">
            You play from your own headset — no venue booking, no seat taken. The slot you pick is
            the window your match is scheduled in.
          </p>
        </div>
      )}

      {steps.length > 1 && (
        <div className="flex gap-2">
          {steps.map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                if (s === 'slot' && needsVenue && !selectedVenue) return;
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
      )}

      {needsVenue && step === 'venue' && (
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
                setSelectedSlot(null);
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

      {step === 'slot' && slotStepReady && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <h2 className="font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4" />
            {selectedVenue ? `Choose slot at ${selectedVenue.name}` : 'Choose your play slot'}
          </h2>

          <SlotPicker
            selectedDate={selectedDate}
            onDateChange={(date) => {
              setSelectedDate(date);
              setSelectedSlot(null);
            }}
            slots={slots}
            isLoading={slotsLoading}
            ignoreCapacity={hasVr}
            selectedSlotId={selectedSlot?.id}
            onSlotSelect={(slot) => {
              setSelectedSlot(slot as SlotOption);
              setShowConfirm(true);
            }}
            emptyMessage={emptySlotMessage}
          />

          {selectedSlot && !showConfirm && (
            <Button className="w-full" onClick={() => setShowConfirm(true)}>
              Continue with selected slot
            </Button>
          )}
        </motion.div>
      )}

      <SlotConfirmModal
        open={showConfirm && !!selectedSlot}
        tournamentName={tournament.name}
        venueName={selectedVenue?.name ?? selectedSlot?.venue.name ?? ''}
        showVenue={needsVenue}
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
