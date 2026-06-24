import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import type {
  Tournament,
  TournamentBracket,
  TournamentParticipant,
  TournamentRegistration,
} from '@vr-tournament/shared';
import { apiDelete, apiGet, getAccessToken } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs } from '@/components/ui/tabs';
import { NormalMatchList } from '@/components/tournament/NormalMatchList';
import { KnockoutBracket } from '@/components/tournament/KnockoutBracket';
import { BuybackButton } from '@/components/tournament/BuybackButton';

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

  const { data: myRegistration } = useQuery({
    queryKey: ['tournament-registration', id],
    queryFn: () => apiGet<TournamentRegistration | null>(`/tournaments/${id}/registration`).catch(() => null),
    enabled: !!id && isLoggedIn,
  });

  const { data: myParticipant } = useQuery({
    queryKey: ['tournament-participant', id],
    queryFn: () => apiGet<TournamentParticipant | null>(`/tournaments/${id}/participant`).catch(() => null),
    enabled: !!id && isLoggedIn && !!myRegistration,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', id] });
      queryClient.invalidateQueries({ queryKey: ['tournament-bracket', id] });
      queryClient.invalidateQueries({ queryKey: ['tournament-registration', id] });
    },
  });

  const handleJoin = () => {
    if (!isLoggedIn) {
      navigate(`/register?returnTo=${encodeURIComponent(`/play?tournament=${id}`)}`);
      return;
    }
    navigate(`/play?tournament=${id}`);
  };

  if (isLoading || !tournament) return <p>Loading...</p>;

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

      <div className="flex flex-wrap gap-2">
        {tournament.status === 'open' && !myRegistration && (
          <Button onClick={handleJoin}>
            {isLoggedIn ? 'Join tournament' : 'Register to join'}
          </Button>
        )}
        {myRegistration && (
          <>
            <Button variant="secondary" onClick={handleJoin}>
              Find next match
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
