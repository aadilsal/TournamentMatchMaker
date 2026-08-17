import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import type {
  Tournament,
  TournamentBracket,
  TournamentEntryState,
  TournamentParticipant,
  TournamentRegistration,
} from '@vr-tournament/shared';
import { apiDelete, apiGet, getAccessToken } from '@/lib/api';
import { invalidateTournamentQueries, LIVE_STALE_TIME } from '@/lib/query-keys';
import { getUserErrorMessage } from '@/lib/user-messages';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs } from '@/components/ui/tabs';
import { NormalMatchList } from '@/components/tournament/NormalMatchList';
import { KnockoutBracket } from '@/components/tournament/KnockoutBracket';
import { BuybackButton } from '@/components/tournament/BuybackButton';
import { DetailPageSkeleton } from '@/components/ui/route-fallback';

export function TournamentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isLoggedIn = !!getAccessToken();
  const [activeTab, setActiveTab] = useState<string>('normal');

  const { data: tournament, isLoading } = useQuery({
    queryKey: ['tournament', id],
    queryFn: () => apiGet<Tournament>(`/tournaments/${id}`),
    enabled: !!id,
  });

  const { data: bracket } = useQuery({
    queryKey: ['tournament-bracket', id],
    queryFn: () => apiGet<TournamentBracket>(`/tournaments/${id}/bracket`),
    enabled: !!id,
  });

  // Not registered is a 200 carrying `null`, so a thrown error here only ever
  // means the question went unanswered — a dropped connection, an expired
  // session, a 500. Swallowing that into `null` stated the opposite of what was
  // known: the page declared the player unregistered and offered Join again,
  // and because the query then counted as successful React Query never retried
  // and cached the wrong answer until something else invalidated it.
  const registrationQuery = useQuery({
    queryKey: ['tournament-registration', id],
    queryFn: () => apiGet<TournamentRegistration | null>(`/tournaments/${id}/registration`),
    enabled: !!id && isLoggedIn,
  });
  const myRegistration = registrationQuery.data ?? null;
  /** Whether the answer is actually known — not merely falsy. */
  const registrationSettled = !isLoggedIn || registrationQuery.isSuccess;

  const { data: myParticipant } = useQuery({
    queryKey: ['tournament-participant', id],
    queryFn: () => apiGet<TournamentParticipant | null>(`/tournaments/${id}/participant`),
    enabled: !!id && isLoggedIn && !!myRegistration,
  });

  // Nothing is scheduled on the player's behalf any more, so the page has to say
  // when the next step is theirs: a round they have advanced into, or a draw they
  // owe a replay for. Without it, a player who has done nothing wrong simply sees
  // no match and no reason for it.
  const { data: entryState } = useQuery({
    queryKey: ['tournament-entry-state', id],
    queryFn: () =>
      apiGet<TournamentEntryState>(`/tournaments/${id}/entry-state`).catch(() => null),
    enabled: !!id && isLoggedIn && !!myRegistration,
    staleTime: LIVE_STALE_TIME,
  });

  useEffect(() => {
    if (!tournament || !bracket) return;
    const hasKnockout =
      tournament.phase === 'knockout' ||
      bracket.rounds.some((r) => r.phase === 'knockout' || (r.round ?? 0) >= 100);
    if (hasKnockout) {
      setActiveTab('knockout');
    }
  }, [tournament, bracket]);

  const withdrawMutation = useMutation({
    mutationFn: () => apiDelete(`/tournaments/${id}/register`),
    onSuccess: () => invalidateTournamentQueries(queryClient, id),
  });

  const handleJoin = () => {
    if (!isLoggedIn) {
      navigate(`/register?returnTo=${encodeURIComponent(`/play?tournament=${id}`)}`);
      return;
    }
    navigate(`/play?tournament=${id}`);
  };

  if (isLoading || !tournament) return <DetailPageSkeleton />;

  const normalRounds = bracket?.rounds.filter((r) => r.phase !== 'knockout' && (r.round ?? 0) < 100) ?? [];
  const koRounds = bracket?.rounds.filter((r) => r.phase === 'knockout' || (r.round ?? 0) >= 100) ?? [];

  const tabs = [
    ...normalRounds.map((r) => ({
      id: `normal-${r.round}`,
      label: r.label ?? `Round ${r.round}`,
    })),
    ...(koRounds.length > 0 ? [{ id: 'knockout', label: 'Knockout' }] : []),
  ];

  const defaultTab = tabs[0]?.id ?? 'normal';
  const currentTab = tabs.some((t) => t.id === activeTab) ? activeTab : defaultTab;

  const activeNormalRound = normalRounds.find((r) => `normal-${r.round}` === currentTab);
  const showKnockout = currentTab === 'knockout';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{tournament.name}</h1>
        <p className="text-[var(--color-muted-foreground)] mt-1">
          {tournament.game} · {tournament.phase} phase
        </p>
        <p className="text-sm mt-2">
          {new Date(tournament.startDate).toLocaleString()} — {new Date(tournament.endDate).toLocaleString()}
        </p>
        <p className="text-sm">
          {tournament.registrationCount ?? 0}
          {tournament.maxPlayers ? ` / ${tournament.maxPlayers}` : ''} players · Round{' '}
          {tournament.currentRoundNumber}
        </p>
      </div>

      {registrationQuery.isError && (
        <p className="text-sm text-[var(--color-destructive)]">
          Couldn’t check whether you’re in this tournament. Your place is safe — reload to try again.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {/* Offered only once it is known the player is not already in. While the
            answer is still loading or has failed, neither this nor the
            registered actions below are shown, so nothing here can be read as
            "your join did not take". */}
        {tournament.status === 'open' && registrationSettled && !myRegistration && (
          <Button onClick={handleJoin}>
            {isLoggedIn ? 'Join tournament' : 'Register to join'}
          </Button>
        )}
        {myRegistration && (
          <>
            <Button
              variant={entryState?.needsSlot ? 'default' : 'secondary'}
              onClick={handleJoin}
            >
              {entryState?.reason === 'rematch'
                ? 'Pick a new slot for your replay'
                : entryState?.reason === 'new_round'
                  ? `Pick your slot for round ${entryState.roundNumber}`
                  : 'Pick slot & find next match'}
            </Button>
            <Button variant="outline" onClick={() => withdrawMutation.mutate()} disabled={withdrawMutation.isPending}>
              {withdrawMutation.isPending ? 'Withdrawing…' : 'Withdraw'}
            </Button>
          </>
        )}
        {myParticipant?.status === 'eliminated' && tournament.phase === 'normal' && (
          <BuybackButton tournamentId={tournament.id} tournament={tournament} />
        )}
      </div>

      {entryState?.reason === 'rematch' && entryState.rematch && (
        <div className="rounded-xl border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 p-4 text-sm space-y-1">
          <p className="font-semibold">
            Your match with {entryState.rematch.opponentName ?? 'your opponent'} was a draw.
          </p>
          <p className="text-[var(--color-muted-foreground)]">
            You replay the same opponent. Pick a new date and time before round{' '}
            {entryState.roundNumber} closes — if only one of you does, the match goes to them.
          </p>
        </div>
      )}

      {entryState?.reason === 'new_round' && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 text-sm space-y-1">
          <p className="font-semibold">You’re through to round {entryState.roundNumber}.</p>
          <p className="text-[var(--color-muted-foreground)]">
            Pick the date you want to play on — your usual time is preselected. You won’t be matched
            until you have.
          </p>
        </div>
      )}

      {/* Registration closes when the tournament leaves the open phase. */}
      {tournament.status !== 'open' && !myRegistration && (
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Registration is closed for this tournament — new players can no longer join.
        </p>
      )}
      {withdrawMutation.isError && (
        <p className="text-sm text-[var(--color-destructive)]">
          {getUserErrorMessage(withdrawMutation.error)}
        </p>
      )}

      {bracket && tabs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Matches</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs tabs={tabs} active={currentTab} onChange={setActiveTab} />
            {showKnockout ? (
              <KnockoutBracket rounds={koRounds} />
            ) : activeNormalRound ? (
              <NormalMatchList matches={activeNormalRound.matches} />
            ) : (
              <NormalMatchList matches={[]} />
            )}
          </CardContent>
        </Card>
      )}

      {tournament.phase === 'knockout' && (
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Knockout phase — losses are final, no buybacks.
        </p>
      )}
    </div>
  );
}
