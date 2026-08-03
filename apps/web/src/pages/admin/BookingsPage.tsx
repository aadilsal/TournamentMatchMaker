import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { AdminBookingRow, Venue } from '@vr-tournament/shared';
import { apiDelete, apiGet } from '@/lib/api';
import {
  AdminQueryError,
  AdminFilterBar,
  AdminFilterField,
  AdminFilterSearch,
  AdminFilterSelect,
  AdminPageHeader,
  AdminTableFooter,
  DataTable,
  StatusBadge,
} from '@/components/admin/AdminUi';
import { Button } from '@/components/ui/button';
import { GridSkeleton } from '@/components/ui/skeleton';
import { useAdminList } from '@/hooks/useAdminList';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { useConfirm } from '@/components/ui/confirm-dialog';

export function AdminBookingsPage() {
  const askConfirm = useConfirm();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [venueId, setVenueId] = useState('');

  const { data: venues = [] } = useQuery({
    queryKey: ['admin', 'venues', 'all'],
    queryFn: () => apiGet<Venue[]>('/admin/venues?limit=100'),
  });

  const list = useAdminList<AdminBookingRow>({
    queryKey: ['admin', 'bookings'],
    path: '/admin/bookings',
    filters: {
      search: search || undefined,
      status: status || undefined,
      venueId: venueId || undefined,
    },
  });

  const cancel = useAdminMutation({
    mutationFn: (booking: AdminBookingRow) => apiDelete(`/admin/bookings/${booking.id}`),
    successMessage: 'Booking cancelled and the slot released.',
    invalidate: [['admin', 'bookings']],
  });

  const handleCancel = async (booking: AdminBookingRow) => {
    const who = booking.username ?? 'this player';
    const when = booking.slotStart
      ? new Date(booking.slotStart).toLocaleString([], {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'their slot';
    const ok = await askConfirm({
      title: 'Cancel this booking?',
      description: (
        <>
          {who}&apos;s booking at {booking.venueName ?? 'the venue'} for <strong>{when}</strong> will be
          cancelled and the slot freed for someone else. They are not automatically rebooked.
        </>
      ),
      confirmLabel: 'Cancel booking',
      cancelLabel: 'Keep booking',
    });
    if (ok) cancel.mutate(booking);
  };

  return (
    <div>
      <AdminPageHeader
        title="Bookings"
        description="All venue slot reservations"
        actions={
          <Link to="/admin/bookings/new">
            <Button size="sm">Create booking</Button>
          </Link>
        }
      />

      <AdminFilterBar>
        <AdminFilterField label="Search" className="min-w-[200px] flex-1">
          <AdminFilterSearch value={search} onChange={setSearch} placeholder="User or venue…" />
        </AdminFilterField>
        <AdminFilterField label="Venue">
          <AdminFilterSelect
            value={venueId}
            onChange={setVenueId}
            options={venues.map((v) => ({ value: v.id, label: v.name }))}
          />
        </AdminFilterField>
        <AdminFilterField label="Status">
          <AdminFilterSelect
            value={status}
            onChange={setStatus}
            options={[
              { value: 'pending', label: 'Pending' },
              { value: 'confirmed', label: 'Confirmed' },
              { value: 'cancelled', label: 'Cancelled' },
            ]}
          />
        </AdminFilterField>
      </AdminFilterBar>

      {list.error ? (
        <AdminQueryError error={list.error} resource="bookings" onRetry={() => list.refetch()} />
      ) : list.isLoading ? (
        <GridSkeleton count={4} />
      ) : (
        <>
          <DataTable
            columns={[
              { key: 'user', label: 'User' },
              { key: 'venue', label: 'Venue' },
              { key: 'slot', label: 'Slot' },
              { key: 'status', label: 'Status' },
              { key: 'created', label: 'Created' },
              { key: 'actions', label: '' },
            ]}
            rows={list.items.map((b) => ({
              user: b.username ?? b.userId.slice(0, 8),
              venue: b.venueName ?? '—',
              slot: b.slotStart
                ? new Date(b.slotStart).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '—',
              status: <StatusBadge status={b.status} />,
              created: new Date(b.createdAt).toLocaleString(),
              actions:
                b.status === 'confirmed' ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-[var(--color-destructive)]"
                    onClick={() => handleCancel(b)}
                    disabled={cancel.isPending}
                  >
                    Cancel
                  </Button>
                ) : null,
            }))}
            emptyMessage="No bookings match your filters"
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
