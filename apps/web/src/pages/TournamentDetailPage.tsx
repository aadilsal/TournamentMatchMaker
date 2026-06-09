import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import type { Tournament, TournamentBracket, TournamentRegistration } from '@vr-tournament/shared';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function TournamentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

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

  const registerMutation = useMutation({
    mutationFn: () => apiPost<TournamentRegistration>(`/tournaments/${id}/register`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', id] });
      queryClient.invalidateQueries({ queryKey: ['tournament-bracket', id] });
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: () => apiDelete(`/tournaments/${id}/register`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', id] });
      queryClient.invalidateQueries({ queryKey: ['tournament-bracket', id] });
    },
  });

  if (isLoading || !tournament) return <p>Loading...</p>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{tournament.name}</h1>
        <p className="text-[var(--color-muted-foreground)] mt-1">
          {tournament.game} · {tournament.format.replace(/_/g, ' ')}
        </p>
        <p className="text-sm mt-2">
          {new Date(tournament.startDate).toLocaleString()} — {new Date(tournament.endDate).toLocaleString()}
        </p>
        <p className="text-sm">
          {tournament.registrationCount ?? 0}
          {tournament.maxPlayers ? ` / ${tournament.maxPlayers}` : ''} players registered
        </p>
      </div>

      {tournament.status === 'open' && (
        <div className="flex gap-2">
          <Button onClick={() => registerMutation.mutate()} disabled={registerMutation.isPending}>
            Register
          </Button>
          <Button variant="outline" onClick={() => withdrawMutation.mutate()} disabled={withdrawMutation.isPending}>
            Withdraw
          </Button>
        </div>
      )}

      {bracket && (
        <Card>
          <CardHeader>
            <CardTitle>Bracket (Round 1)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {bracket.rounds[0]?.matches.map((m, i) => (
              <div key={i} className="flex justify-between text-sm border-b border-[var(--color-border)] pb-2">
                <span>{m.player1?.username ?? 'TBD'}</span>
                <span className="text-[var(--color-muted-foreground)]">vs</span>
                <span>{m.player2?.username ?? 'BYE'}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
