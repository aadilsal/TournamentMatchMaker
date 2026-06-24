import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiPost } from '@/lib/api';
import {
  AdminCard,
  AdminFilterBar,
  AdminFilterField,
  AdminFilterSearch,
  AdminFilterSelect,
  AdminPageHeader,
  AdminTableFooter,
  DataTable,
  StatusPill,
} from '@/components/admin/AdminUi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GridSkeleton } from '@/components/ui/skeleton';
import { useAdminList } from '@/hooks/useAdminList';

interface NotifRow {
  id: string;
  username?: string;
  type: string;
  channel: string;
  status: string;
  read: boolean;
  createdAt: string;
}

export function AdminNotificationsPage() {
  const [broadcastType, setBroadcastType] = useState('announcement');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');

  const list = useAdminList<NotifRow>({
    queryKey: ['admin', 'notifications'],
    path: '/admin/notifications',
    filters: {
      type: type || undefined,
      status: status || undefined,
    },
  });

  const broadcast = useMutation({
    mutationFn: () =>
      apiPost('/admin/notifications/broadcast', {
        type: broadcastType,
        channel: 'in_app',
        payload: { message: broadcastMessage },
      }),
    onSuccess: () => list.refetch(),
  });

  return (
    <div>
      <AdminPageHeader title="Notifications" description="Sent and broadcast messages" />

      <AdminCard className="p-5 mb-6 max-w-lg space-y-3">
        <h3 className="font-semibold text-sm">Broadcast to all players</h3>
        <div>
          <Label className="text-xs">Type</Label>
          <Input value={broadcastType} onChange={(e) => setBroadcastType(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Message</Label>
          <Input value={broadcastMessage} onChange={(e) => setBroadcastMessage(e.target.value)} />
        </div>
        <Button size="sm" onClick={() => broadcast.mutate()} disabled={broadcast.isPending || !broadcastMessage}>
          Send broadcast
        </Button>
        {broadcast.isSuccess && <p className="text-xs text-[var(--color-primary)]">Broadcast queued</p>}
      </AdminCard>

      <AdminFilterBar>
        <AdminFilterField label="Type" className="min-w-[160px]">
          <AdminFilterSearch value={type} onChange={setType} placeholder="e.g. announcement" />
        </AdminFilterField>
        <AdminFilterField label="Status">
          <AdminFilterSelect
            value={status}
            onChange={setStatus}
            options={[
              { value: 'pending', label: 'Pending' },
              { value: 'sent', label: 'Sent' },
              { value: 'failed', label: 'Failed' },
            ]}
          />
        </AdminFilterField>
      </AdminFilterBar>

      {list.isLoading ? (
        <GridSkeleton count={4} />
      ) : (
        <>
          <DataTable
            columns={[
              { key: 'user', label: 'User' },
              { key: 'type', label: 'Type' },
              { key: 'channel', label: 'Channel' },
              { key: 'status', label: 'Status' },
              { key: 'date', label: 'Sent' },
            ]}
            rows={list.items.map((n) => ({
              user: n.username ?? '—',
              type: n.type,
              channel: n.channel,
              status: <StatusPill status={n.status} />,
              date: new Date(n.createdAt).toLocaleString(),
            }))}
            emptyMessage="No notifications match your filters"
          />
          <AdminTableFooter
            count={list.items.length}
            pageIndex={list.pageIndex}
            limit={list.limit}
            canPrev={list.canPrev}
            canNext={list.canNext}
            isFetching={list.isFetching}
            onPrev={list.prevPage}
            onNext={list.nextPage}
            onLimitChange={list.setLimit}
          />
        </>
      )}
    </div>
  );
}
