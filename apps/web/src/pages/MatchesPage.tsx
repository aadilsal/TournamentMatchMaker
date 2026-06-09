import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Match } from '@vr-tournament/shared';
import { apiGet, apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSocketEvent } from '@/hooks/useSocket';
import { MatchFoundModal } from '@/components/match/MatchFoundModal';
import { useState } from 'react';
import { MapPin, Trophy } from 'lucide-react';

export function MatchesPage() {
  const queryClient = useQueryClient();
  const [matchModal, setMatchModal] = useState<Parameters<typeof MatchFoundModal>[0]['match'] | null>(null);

  const { data: matches = [], isLoading } = useQuery({
    queryKey: ['matches'],
    queryFn: () => apiGet<Match[]>('/matches/me'),
  });

  useSocketEvent('match:found', (data) => {
    setMatchModal(data);
    queryClient.invalidateQueries({ queryKey: ['matches'] });
  });

  const confirmMutation = useMutation({
    mutationFn: (matchId: string) => apiPost<Match>(`/matches/${matchId}/confirm`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['matches'] }),
  });

  const declineMutation = useMutation({
    mutationFn: (matchId: string) => apiPost<Match>(`/matches/${matchId}/decline`, { requeue: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['matches'] }),
  });

  const active = matches.filter((m) =>
    ['pending_confirmation', 'confirmed', 'in_progress'].includes(m.status)
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold flex items-center gap-2">
        <Trophy className="h-8 w-8 text-[var(--color-primary)]" />
        My Matches
      </h1>

      {isLoading && <p>Loading...</p>}

      {active.length === 0 && !isLoading && (
        <p className="text-[var(--color-muted-foreground)]">No active matches.</p>
      )}

      {active.map((match) => (
        <Card key={match.id}>
          <CardHeader>
            <CardTitle>
              {match.player1?.username} vs {match.player2?.username}
            </CardTitle>
            <CardDescription>Status: {match.status.replace('_', ' ')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {match.venue && (
              <p className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4" />
                {match.venue.name}, {match.venue.city}
              </p>
            )}
            {match.slot && (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                {new Date(match.slot.startTime).toLocaleString()}
              </p>
            )}
            {match.status === 'pending_confirmation' && (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => confirmMutation.mutate(match.id)} disabled={confirmMutation.isPending}>
                  Confirm
                </Button>
                <Button size="sm" variant="outline" onClick={() => declineMutation.mutate(match.id)} disabled={declineMutation.isPending}>
                  Decline
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {matchModal && (
        <MatchFoundModal match={matchModal} onClose={() => setMatchModal(null)} />
      )}
    </div>
  );
}
