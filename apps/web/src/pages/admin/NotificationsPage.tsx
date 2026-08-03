import { useState } from 'react';
import { apiPost } from '@/lib/api';
import {
  AdminQueryError,
  AdminCard,
  AdminFieldError,
  AdminFilterBar,
  AdminFilterField,
  AdminFilterSelect,
  AdminPageHeader,
  AdminTableFooter,
  DataTable,
  StatusBadge,
} from '@/components/admin/AdminUi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { GridSkeleton } from '@/components/ui/skeleton';
import { useAdminList } from '@/hooks/useAdminList';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  NOTIFICATION_TYPE_OPTIONS,
  NOTIFICATION_FILTER_TYPE_OPTIONS,
  adminBroadcastFormSchema,
  validateAdminForm,
  type FieldErrors,
} from '@/lib/admin-form-validation';

const BROADCAST_MAX_LENGTH = 500;

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
  const [broadcastType, setBroadcastType] = useState<string>('announcement');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastErrors, setBroadcastErrors] = useState<FieldErrors>({});
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const askConfirm = useConfirm();

  const list = useAdminList<NotifRow>({
    queryKey: ['admin', 'notifications'],
    path: '/admin/notifications',
    filters: {
      type: type || undefined,
      status: status || undefined,
    },
  });

  const broadcast = useAdminMutation({
    mutationFn: (body: { type: string; message: string }) =>
      apiPost('/admin/notifications/broadcast', {
        type: body.type,
        channel: 'in_app',
        payload: { message: body.message },
      }),
    successMessage: 'Broadcast queued for every player.',
    onSuccess: () => {
      setBroadcastMessage('');
      void list.refetch();
    },
  });

  const handleBroadcast = async () => {
    const result = validateAdminForm(adminBroadcastFormSchema, {
      type: broadcastType,
      message: broadcastMessage,
    });
    if (!result.ok) {
      setBroadcastErrors(result.errors);
      return;
    }
    setBroadcastErrors({});

    const ok = await askConfirm({
      title: 'Send this broadcast to every player?',
      description: (
        <>
          This delivers an in-app notification to <strong>all registered players</strong> at once. It cannot
          be recalled once sent. Message:
          <span className="mt-2 block rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[var(--color-foreground)]">
            {result.data.message}
          </span>
        </>
      ),
      confirmLabel: 'Send broadcast',
      tone: 'default',
    });
    if (ok) broadcast.mutate({ type: result.data.type, message: result.data.message });
  };

  return (
    <div>
      <AdminPageHeader title="Notifications" description="Sent and broadcast messages" />

      <AdminCard className="p-5 mb-6 max-w-lg space-y-3">
        <h3 className="font-semibold text-sm">Broadcast to all players</h3>
        <div>
          <Label className="text-xs" htmlFor="broadcast-type">Type</Label>
          <Select
            id="broadcast-type"
            value={broadcastType}
            onChange={(e) => {
              setBroadcastType(e.target.value);
              setBroadcastErrors((prev) => ({ ...prev, type: '' }));
            }}
            aria-invalid={Boolean(broadcastErrors.type)}
          >
            {NOTIFICATION_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <AdminFieldError message={broadcastErrors.type} />
        </div>
        <div>
          <Label className="text-xs" htmlFor="broadcast-message">Message</Label>
          <Input
            id="broadcast-message"
            value={broadcastMessage}
            maxLength={BROADCAST_MAX_LENGTH}
            onChange={(e) => {
              setBroadcastMessage(e.target.value);
              setBroadcastErrors((prev) => ({ ...prev, message: '' }));
            }}
            aria-invalid={Boolean(broadcastErrors.message)}
          />
          <div className="mt-1 flex items-start justify-between gap-2">
            <AdminFieldError message={broadcastErrors.message} />
            <span className="ml-auto shrink-0 text-xs text-[var(--color-muted-foreground)]">
              {broadcastMessage.length}/{BROADCAST_MAX_LENGTH}
            </span>
          </div>
        </div>
        <Button size="sm" onClick={handleBroadcast} disabled={broadcast.isPending}>
          {broadcast.isPending ? 'Sending…' : 'Send broadcast'}
        </Button>
      </AdminCard>

      <AdminFilterBar>
        <AdminFilterField label="Type" className="min-w-[180px]">
          <AdminFilterSelect
            value={type}
            onChange={setType}
            options={NOTIFICATION_FILTER_TYPE_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
          />
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

      {list.error ? (
        <AdminQueryError error={list.error} resource="notifications" onRetry={() => list.refetch()} />
      ) : list.isLoading ? (
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
              status: <StatusBadge status={n.status} />,
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
