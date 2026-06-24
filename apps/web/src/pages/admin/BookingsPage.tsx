import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminBookingRow, Venue } from '@vr-tournament/shared';
import { apiDelete, apiGet } from '@/lib/api';
import {
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
import { GridSkeleton } from '@/components/ui/skeleton';
import { useAdminList } from '@/hooks/useAdminList';

export function AdminBookingsPage() {
  const queryClient = useQueryClient();
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

  const cancel = useMutation({
    mutationFn: (id: string) => apiDelete(`/admin/bookings/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'bookings'] });
    },
  });

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

      {list.isLoading ? (
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
              status: <StatusPill status={b.status} />,
              created: new Date(b.createdAt).toLocaleString(),
              actions:
                b.status === 'confirmed' ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => cancel.mutate(b.id)}
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
