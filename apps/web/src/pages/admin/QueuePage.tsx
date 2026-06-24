import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminQueueOverview } from '@vr-tournament/shared';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import { AdminPageHeader, AdminCard, DataTable } from '@/components/admin/AdminUi';
import { Button } from '@/components/ui/button';
import { GridSkeleton } from '@/components/ui/skeleton';

export function AdminQueuePage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'queue'],
    queryFn: () => apiGet<AdminQueueOverview>('/admin/queue'),
    refetchInterval: 5000,
  });

  const triggerPair = useMutation({
    mutationFn: () => apiPost('/admin/queue/trigger-pair'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'queue'] }),
  });

  const kick = useMutation({
    mutationFn: (userId: string) => apiDelete(`/admin/queue/players/${userId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'queue'] }),
  });

  if (isLoading) return <GridSkeleton count={3} />;

  return (
    <div>
      <AdminPageHeader
        title="Matchmaking queue"
        description="Live queue state (refreshes every 5s)"
        actions={
          <Button size="sm" onClick={() => triggerPair.mutate()} disabled={triggerPair.isPending}>
            Trigger pairing
          </Button>
        }
      />

      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <AdminCard className="p-4">
          <p className="text-xs text-[var(--color-muted-foreground)]">Global queue</p>
          <p className="text-2xl font-bold">{data?.globalSize ?? 0}</p>
        </AdminCard>
        <AdminCard className="p-4">
          <p className="text-xs text-[var(--color-muted-foreground)]">Tournament queues</p>
          <p className="text-sm mt-1">
            {data?.tournaments.length
              ? data.tournaments.map((t) => `${t.name}: ${t.size}`).join(' · ')
              : 'None'}
          </p>
        </AdminCard>
      </div>

      <DataTable
        columns={[
          { key: 'player', label: 'Player' },
          { key: 'tournament', label: 'Tournament' },
          { key: 'wait', label: 'Wait (s)' },
          { key: 'round', label: 'Round' },
          { key: 'solo', label: 'Solo' },
          { key: 'actions', label: '' },
        ]}
        rows={(data?.entries ?? []).map((e) => ({
          player: e.username,
          tournament: e.tournamentName ?? 'Global',
          wait: e.waitSeconds,
          round: e.roundNumber,
          solo: e.soloTarget ?? '—',
          actions: (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={() => kick.mutate(e.userId)}
            >
              Kick
            </Button>
          ),
        }))}
        emptyMessage="Queue is empty"
      />
    </div>
  );
}
