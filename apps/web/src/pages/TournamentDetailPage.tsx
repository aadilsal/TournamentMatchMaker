import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import type { Tournament, TournamentBracket, TournamentRegistration } from '@vr-tournament/shared';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge, matchStatusBadge } from '@/components/ui/badge';
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

  const { data: myRegistration } = useQuery({
    queryKey: ['tournament-registration', id],
    queryFn: () => apiGet<TournamentRegistration | null>(`/tournaments/${id}/registration`).catch(() => null),
    enabled: !!id,
  });

  const registerMutation = useMutation({
    mutationFn: () => apiPost<TournamentRegistration>(`/tournaments/${id}/register`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', id] });
      queryClient.invalidateQueries({ queryKey: ['tournament-bracket', id] });
      queryClient.invalidateQueries({ queryKey: ['tournament-registration', id] });
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: () => apiDelete(`/tournaments/${id}/register`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', id] });
      queryClient.invalidateQueries({ queryKey: ['tournament-bracket', id] });
      queryClient.invalidateQueries({ queryKey: ['tournament-registration', id] });
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
          {myRegistration ? (
            <Button variant="outline" onClick={() => withdrawMutation.mutate()} disabled={withdrawMutation.isPending}>
              {withdrawMutation.isPending ? 'Withdrawing…' : 'Withdraw'}
            </Button>
          ) : (
            <Button onClick={() => registerMutation.mutate()} disabled={registerMutation.isPending}>
              {registerMutation.isPending ? 'Registering…' : 'Register'}
            </Button>
          )}
        </div>
      )}

      {bracket && (
        <Card>
          <CardHeader>
            <CardTitle>Bracket (Round 1)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {bracket.rounds[0]?.matches.map((m, i) => {
              const badge = m.status ? matchStatusBadge(m.status) : null;
              return (
                <div key={i} className="flex items-center gap-3 text-sm border-b border-[var(--color-border)] pb-2">
                  <span className="flex-1 truncate">{m.player1?.username ?? 'TBD'}</span>
                  <div className="shrink-0">
                    {badge
                      ? <Badge variant={badge.variant}>{badge.label}</Badge>
                      : <span className="text-[var(--color-muted-foreground)]">vs</span>
                    }
                  </div>
                  <span className="flex-1 truncate text-right">{m.player2?.username ?? 'BYE'}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
