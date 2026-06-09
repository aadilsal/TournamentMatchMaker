import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { QueueStatus } from '@vr-tournament/shared';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSocketEvent } from '@/hooks/useSocket';
import { MatchFoundModal } from '@/components/match/MatchFoundModal';
import { Loader2, Swords, Users } from 'lucide-react';

export function MatchmakingPage() {
  const queryClient = useQueryClient();
  const [matchModal, setMatchModal] = useState<Parameters<typeof MatchFoundModal>[0]['match'] | null>(null);

  const { data: status, isLoading } = useQuery({
    queryKey: ['matchmaking-status'],
    queryFn: () => apiGet<QueueStatus>('/matchmaking/status'),
    refetchInterval: (query) => (query.state.data?.inQueue ? 3000 : false),
  });

  useSocketEvent('queue:joined', () => {
    queryClient.invalidateQueries({ queryKey: ['matchmaking-status'] });
  });

  useSocketEvent('queue:position', () => {
    queryClient.invalidateQueries({ queryKey: ['matchmaking-status'] });
  });

  useSocketEvent('match:found', (data) => {
    setMatchModal(data);
    queryClient.invalidateQueries({ queryKey: ['matchmaking-status'] });
    queryClient.invalidateQueries({ queryKey: ['matches'] });
  });

  const joinMutation = useMutation({
    mutationFn: () => apiPost<QueueStatus>('/matchmaking/queue', {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['matchmaking-status'] }),
  });

  const leaveMutation = useMutation({
    mutationFn: () => apiDelete<QueueStatus>('/matchmaking/queue'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['matchmaking-status'] }),
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Swords className="h-8 w-8 text-[var(--color-primary)]" />
          Matchmaking Queue
        </h1>
        <p className="text-[var(--color-muted-foreground)] mt-2">
          Join the queue to get paired with an opponent by skill tier.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Queue Status</CardTitle>
          <CardDescription>Skill-tier matching with 30s / 90s expansion windows</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : status?.inQueue ? (
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5" />
                Position <strong>#{status.position}</strong> of {status.queueSize}
              </p>
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Waiting {status.waitSeconds}s
              </p>
              <Button variant="destructive" onClick={() => leaveMutation.mutate()} disabled={leaveMutation.isPending}>
                Leave Queue
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-[var(--color-muted-foreground)]">You are not in the queue.</p>
              <Button onClick={() => joinMutation.mutate()} disabled={joinMutation.isPending}>
                Join Queue
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-sm text-[var(--color-muted-foreground)]">
        Or <Link to="/tournaments" className="text-[var(--color-primary)] hover:underline">register for a tournament</Link> and join its queue.
      </p>

      {matchModal && (
        <MatchFoundModal match={matchModal} onClose={() => setMatchModal(null)} />
      )}
    </div>
  );
}
