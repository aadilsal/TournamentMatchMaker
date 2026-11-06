import { useQuery } from '@tanstack/react-query';
import type { AdminQueueOverview } from '@vr-tournament/shared';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import { AdminPageHeader, AdminCard, AdminQueryError, DataTable } from '@/components/admin/AdminUi';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { GridSkeleton } from '@/components/ui/skeleton';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { formatDuration } from '@/lib/format';

export function AdminQueuePage() {
  const askConfirm = useConfirm();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'queue'],
    queryFn: () => apiGet<AdminQueueOverview>('/admin/queue'),
    refetchInterval: 5000,
  });

  const invalidate = [['admin', 'queue']];

  const triggerPair = useAdminMutation({
    mutationFn: () => apiPost<{ paired?: number }>('/admin/queue/trigger-pair'),
    successMessage: (result) =>
      typeof result?.paired === 'number'
        ? result.paired === 0
          ? 'Pairing run finished — no eligible pairs found.'
          : `Pairing run created ${result.paired} match${result.paired === 1 ? '' : 'es'}.`
        : 'Pairing run triggered.',
    invalidate,
  });

  const kick = useAdminMutation({
    mutationFn: (player: { userId: string; username: string }) =>
      apiDelete(`/admin/queue/players/${player.userId}`),
    successMessage: (_data, player) => `Removed ${player.username} from the queue.`,
    invalidate,
  });

  if (isLoading) return <GridSkeleton count={3} />;
  if (error || !data)
    return <AdminQueryError error={error} resource="queue" onRetry={() => refetch()} />;

  const handleKick = async (player: { userId: string; username: string }) => {
    const ok = await askConfirm({
      title: `Remove ${player.username} from the queue?`,
      description: 'They stop waiting for an opponent and must re-enter the queue themselves to be paired.',
      confirmLabel: 'Remove from queue',
    });
    if (ok) kick.mutate(player);
  };

  return (
    <div>
      <AdminPageHeader
        title="Matchmaking queue"
        description="Live queue state (refreshes every 5s)"
        actions={
          <Button size="sm" onClick={() => triggerPair.mutate()} disabled={triggerPair.isPending}>
            {triggerPair.isPending ? 'Pairing…' : 'Trigger pairing'}
          </Button>
        }
      />

      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <AdminCard className="p-4">
          <p className="text-xs text-[var(--color-muted-foreground)]">Global queue</p>
          <p className="text-2xl font-bold">{data.globalSize ?? 0}</p>
        </AdminCard>
        <AdminCard className="p-4">
          <p className="text-xs text-[var(--color-muted-foreground)]">Tournament queues</p>
          <p className="text-sm mt-1">
            {data.tournaments.length
              ? data.tournaments.map((t) => `${t.name}: ${t.size}`).join(' · ')
              : 'None'}
          </p>
        </AdminCard>
      </div>

      <DataTable
        columns={[
          { key: 'player', label: 'Player' },
          { key: 'tournament', label: 'Tournament' },
          { key: 'wait', label: 'Waiting' },
          { key: 'round', label: 'Round' },
          { key: 'solo', label: 'Solo' },
          { key: 'actions', label: '' },
        ]}
        rows={(data.entries ?? []).map((e) => ({
          player: e.username,
          tournament: e.tournamentName ?? 'Global',
          wait: formatDuration(e.waitSeconds),
          round: e.roundNumber,
          solo: e.soloTarget ?? '—',
          actions: (
            <Button
              size="sm"
              variant="ghost"
              className="text-[var(--color-destructive)]"
              onClick={() => handleKick({ userId: e.userId, username: e.username })}
              disabled={kick.isPending}
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
