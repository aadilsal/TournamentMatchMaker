import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  EnterTournamentResult,
  PendingRematch,
  TimeSlot,
  Tournament,
  TournamentEntryState,
  TournamentRoundSlot,
  User,
  Venue,
} from '@vr-tournament/shared';
import { apiGet, apiPost, getAccessToken } from '@/lib/api';
import { LIVE_STALE_TIME, SAFETY_POLL_MS, invalidateTournamentQueries } from '@/lib/query-keys';
import { getUserErrorMessage } from '@/lib/user-messages';
import { Button } from '@/components/ui/button';
import { DetailPageSkeleton } from '@/components/ui/route-fallback';
import { MapPin, Clock, ChevronRight, Headset, Swords } from 'lucide-react';
import { motion } from 'motion/react';
import { SlotConfirmModal } from '@/components/tournament/SlotConfirmModal';
import {
  SlotPicker,
  todayString,
  getNextDates,
  getRoundDates,
} from '@/components/slots/SlotPicker';

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
  rematch: PendingRematch | null;
  slots: SlotOption[];
}

/** Local `HH:MM` of an ISO timestamp — the part of a slot that carries over. */
function timeOfDay(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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

  // Why the player is here and what may be defaulted. A replay of a draw is a
  // fresh pick of both date and time, so it carries nothing forward; advancing a
  // round carries the time of day but never the date.
  const { data: entryState } = useQuery({
    queryKey: ['tournament-entry-state', tournamentId],
    queryFn: () =>
      apiGet<TournamentEntryState>(`/tournaments/${tournamentId}/entry-state`).catch(() => null),
    enabled: !!tournamentId && !!getAccessToken(),
    staleTime: LIVE_STALE_TIME,
  });

  const rematch = entryState?.reason === 'rematch' ? entryState.rematch : null;
  const carryTime = entryState?.carryPreviousTime ?? false;

  // The slot the player already holds in this tournament. Drives the defaults so
  // re-entering for a new round is one click rather than a full re-pick.
  const { data: previousRoundSlotRaw } = useQuery({
    queryKey: ['tournament-my-slot', tournamentId],
    queryFn: () =>
      apiGet<TournamentRoundSlot | null>(`/tournaments/${tournamentId}/my-slot`).catch(() => null),
    enabled: !!tournamentId && !!getAccessToken(),
  });

  // A replay must not inherit anything from the drawn match — not the venue it
  // jumps to, not the day it opens on, not the slot it preselects.
  const previousRoundSlot = rematch ? null : previousRoundSlotRaw;

  // Jump straight to the slot step on the venue the player used last round.
  useEffect(() => {
    if (!needsVenue || selectedVenue || !previousRoundSlot?.venueId) return;
    const venue = venues.find((v) => v.id === previousRoundSlot.venueId);
    if (venue) {
      setSelectedVenue(venue);
      setStep('slot');
    }
  }, [needsVenue, selectedVenue, previousRoundSlot, venues]);

  // The date is never inherited. It used to open on the day of the previous
  // slot, which is the day of the round the player has already finished — the
  // one date the new round cannot be played on. The strip opens on the first day
  // of the round instead (see `roundDates` below) and the player picks.

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

  // The time of day to preselect on whichever date the player lands on. Matching
  // by slot id alone only ever worked while the date stayed the same: a slot is
  // a specific window on a specific day, so the id of last round's slot matches
  // nothing on a new date, and the carried default silently disappeared.
  const carriedStartTime =
    carryTime && previousRoundSlot?.slot ? timeOfDay(previousRoundSlot.slot.startTime) : null;

  // Only offer days the round can actually be played on. Without a round window
  // (no active round) fall back to the rolling week, which is what the server
  // will accept in that case anyway.
  const roundDates = useMemo(() => {
    const round = slotOptions?.round;
    if (!round) return getNextDates(7);
    const dates = getRoundDates(round.startsAt, round.endsAt);
    return dates.length > 0 ? dates : [todayString()!];
  }, [slotOptions?.round]);

  // The strip starts on today, but the round may not open until later — move the
  // selection onto the first playable day rather than showing an empty list.
  useEffect(() => {
    if (roundDates.length === 0) return;
    if (!roundDates.includes(selectedDate)) {
      setSelectedDate(roundDates[0]!);
    }
  }, [roundDates, selectedDate]);

  // Re-entering a later round defaults to the same time of day, on the date the
  // player has chosen. A replay of a draw carries nothing, so neither branch
  // fires for it.
  useEffect(() => {
    if (selectedSlot || slots.length === 0) return;
    const sameSlot = previousSlotId ? slots.find((slot) => slot.id === previousSlotId) : undefined;
    const sameTime = carriedStartTime
      ? slots.find((slot) => timeOfDay(slot.startTime) === carriedStartTime)
      : undefined;
    const preselect = sameSlot ?? sameTime;
    if (preselect) setSelectedSlot(preselect);
  }, [previousSlotId, carriedStartTime, slots, selectedSlot]);

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
    ? 'No slots left on this date for this round. Try another day.'
    : undefined;

  const roundWindowLabel = slotOptions?.round
    ? `Round ${roundNumber} runs until ${new Date(slotOptions.round.endsAt).toLocaleString([], {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })} — only days inside it can be played.`
    : null;

  const opponentName = rematch?.opponentName ?? 'your opponent';

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">
          {rematch ? `Replay against ${opponentName}` : `Join ${tournament.name}`}
        </h1>
        <p className="text-[var(--color-muted-foreground)] mt-1">
          {rematch
            ? 'Pick a new date and time for the replay. You will be matched with the same opponent — nobody else.'
            : hasVr
              ? 'Pick the time you want to play in — we’ll find your opponent for that window.'
              : 'Pick a venue and time slot — we’ll book and find your opponent automatically.'}
        </p>
        <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
          Round {roundNumber}
          {!rematch && carriedStartTime && ' · same time as last round is preselected — pick your date'}
        </p>
      </div>

      {rematch && (
        <div className="flex items-start gap-3 rounded-xl border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 p-4">
          <Swords className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-primary)]" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold">
              Your match with {opponentName} was a draw — you play it again.
            </p>
            <p className="text-[var(--color-muted-foreground)]">
              {rematch.opponentHasChosenSlot
                ? `${opponentName} has already picked their window. Pick yours and the replay is scheduled.`
                : `${opponentName} is picking their window too. The replay is scheduled once you both have.`}
            </p>
            <p className="text-[var(--color-muted-foreground)]">
              Pick before the round closes — if only one of you does, the match is awarded to them.
            </p>
          </div>
        </div>
      )}

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
          {roundWindowLabel && (
            <p className="text-sm text-[var(--color-muted-foreground)] -mt-2">{roundWindowLabel}</p>
          )}

          <SlotPicker
            dates={roundDates}
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
