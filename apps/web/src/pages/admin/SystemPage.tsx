import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { AuditLogEntry, SystemHealth } from '@vr-tournament/shared';
import { apiGet, apiPost } from '@/lib/api';
import {
  AdminCard,
  AdminFilterBar,
  AdminFilterField,
  AdminFilterSearch,
  AdminPageHeader,
  AdminTableFooter,
  DataTable,
  StatCard,
} from '@/components/admin/AdminUi';
import { Button } from '@/components/ui/button';
import { GridSkeleton } from '@/components/ui/skeleton';
import { useAdminList } from '@/hooks/useAdminList';
import { useQuery } from '@tanstack/react-query';

export function AdminSystemPage() {
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');

  const { data: health, isLoading } = useQuery({
    queryKey: ['admin', 'system', 'health'],
    queryFn: () => apiGet<SystemHealth>('/admin/system/health'),
  });

  const audit = useAdminList<AuditLogEntry>({
    queryKey: ['admin', 'audit'],
    path: '/admin/audit-logs',
    filters: {
      entityType: entityType || undefined,
      action: action || undefined,
    },
  });

  const expireMatches = useMutation({
    mutationFn: () => apiPost('/admin/system/expire-matches'),
  });

  if (isLoading) return <GridSkeleton count={4} />;

  return (
    <div>
      <AdminPageHeader
        title="System"
        description="Health, maintenance, and audit log"
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() => expireMatches.mutate()}
            disabled={expireMatches.isPending}
          >
            Expire stale matches
          </Button>
        }
      />

      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <StatCard label="Database" value={health?.database === 'ok' ? 'OK' : 'Error'} />
        <StatCard label="Redis" value={health?.redis === 'ok' ? 'OK' : 'Error'} />
      </div>

      {health?.tableCounts && (
        <AdminCard className="p-4 mb-6">
          <p className="text-xs font-medium text-[var(--color-muted-foreground)] mb-2">Table counts</p>
          <div className="flex flex-wrap gap-3 text-sm">
            {Object.entries(health.tableCounts).map(([table, count]) => (
              <span key={table}>
                {table}: <strong>{count}</strong>
              </span>
            ))}
          </div>
        </AdminCard>
      )}

      <AdminPageHeader title="Audit log" description="Recent admin actions" />

      <AdminFilterBar>
        <AdminFilterField label="Entity type" className="min-w-[140px]">
          <AdminFilterSearch value={entityType} onChange={setEntityType} placeholder="e.g. user" />
        </AdminFilterField>
        <AdminFilterField label="Action" className="min-w-[180px] flex-1">
          <AdminFilterSearch value={action} onChange={setAction} placeholder="e.g. tournament.publish" />
        </AdminFilterField>
      </AdminFilterBar>

      {audit.isLoading ? (
        <GridSkeleton count={4} />
      ) : (
        <>
          <DataTable
            columns={[
              { key: 'action', label: 'Action' },
              { key: 'entity', label: 'Entity' },
              { key: 'actor', label: 'Actor' },
              { key: 'time', label: 'Time' },
            ]}
            rows={audit.items.map((a) => ({
              action: a.action,
              entity: `${a.entityType}${a.entityId ? ` #${a.entityId.slice(0, 8)}` : ''}`,
              actor: a.actorUsername ?? a.actorId?.slice(0, 8) ?? 'system',
              time: new Date(a.createdAt).toLocaleString(),
            }))}
            emptyMessage="No audit entries match your filters"
          />
          <AdminTableFooter
            count={audit.items.length}
            pageIndex={audit.pageIndex}
            limit={audit.limit}
            canPrev={audit.canPrev}
            canNext={audit.canNext}
            isFetching={audit.isFetching}
            onPrev={audit.prevPage}
            onNext={audit.nextPage}
            onLimitChange={audit.setLimit}
          />
        </>
      )}
    </div>
  );
}
