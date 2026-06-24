import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TimeSlot, Venue } from '@vr-tournament/shared';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import {
  AdminPageHeader,
  AdminCard,
  AdminFilterBar,
  AdminFilterField,
  AdminFilterSelect,
  PagedDataTable,
  StatusPill,
} from '@/components/admin/AdminUi';
import { UserPicker } from '@/components/admin/UserPicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import { GridSkeleton } from '@/components/ui/skeleton';

export function AdminVenueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [genStart, setGenStart] = useState(date);
  const [genEnd, setGenEnd] = useState(date);
  const [slotStatus, setSlotStatus] = useState('');

  const { data: venue, isLoading } = useQuery({
    queryKey: ['admin', 'venue', id],
    queryFn: () => apiGet<Venue>(`/admin/venues/${id}`),
    enabled: !!id,
  });

  const { data: slots = [] } = useQuery({
    queryKey: ['admin', 'venue', id, 'slots', date],
    queryFn: () => apiGet<TimeSlot[]>(`/admin/venues/${id}/slots?date=${date}`),
    enabled: !!id,
  });

  const [assignUserId, setAssignUserId] = useState('');

  const { data: admins = [] } = useQuery({
    queryKey: ['admin', 'venue', id, 'admins'],
    queryFn: () =>
      apiGet<Array<{ userId: string; username: string; email: string }>>(`/admin/venues/${id}/admins`),
    enabled: !!id,
  });

  const assignAdmin = useMutation({
    mutationFn: () => apiPost(`/admin/venues/${id}/admins`, { userId: assignUserId }),
    onSuccess: () => {
      setAssignUserId('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'venue', id, 'admins'] });
    },
  });

  const removeAdmin = useMutation({
    mutationFn: (userId: string) => apiDelete(`/admin/venues/${id}/admins/${userId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'venue', id, 'admins'] }),
  });

  const generate = useMutation({
    mutationFn: () =>
      apiPost(`/admin/venues/${id}/slots/generate`, {
        startDate: genStart,
        endDate: genEnd,
        startHour: 10,
        endHour: 20,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'venue', id, 'slots'] });
    },
  });

  const unlockSlot = useMutation({
    mutationFn: (slotId: string) => apiPost(`/admin/slots/${slotId}/unlock`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'venue', id, 'slots'] }),
  });

  const recountSlot = useMutation({
    mutationFn: (slotId: string) => apiPost(`/admin/slots/${slotId}/recount`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'venue', id, 'slots'] }),
  });

  if (isLoading) return <GridSkeleton count={3} />;
  if (!venue) return <p>Venue not found</p>;

  const filteredSlots = slotStatus ? slots.filter((s) => s.status === slotStatus) : slots;

  return (
    <div>
      <AdminPageHeader
        title={venue.name}
        description={`${venue.address}, ${venue.city}`}
        actions={
          <>
            <Link to={`/admin/venues/${id}/edit`}>
              <Button variant="outline" size="sm">Edit</Button>
            </Link>
            <Link to="/admin/venues">
              <Button variant="outline" size="sm">← All</Button>
            </Link>
          </>
        }
      />

      <AdminCard className="p-5 mb-6">
        <p className="text-sm">
          Capacity: {venue.capacity} · {venue.active ? 'Active' : 'Inactive'} ·{' '}
          {venue.latitude.toFixed(4)}, {venue.longitude.toFixed(4)}
        </p>
      </AdminCard>

      <AdminPageHeader title="Venue admins" description="Users who can manage this venue" />
      <AdminCard className="p-4 mb-6 space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <UserPicker value={assignUserId} onChange={setAssignUserId} label="Assign admin" />
          </div>
          <Button size="sm" onClick={() => assignAdmin.mutate()} disabled={!assignUserId}>
            Assign
          </Button>
        </div>
        {admins.length > 0 ? (
          <ul className="text-sm space-y-2">
            {admins.map((a) => (
              <li key={a.userId} className="flex justify-between items-center">
                <span>{a.username} ({a.email})</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => removeAdmin.mutate(a.userId)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--color-muted-foreground)]">No venue admins assigned</p>
        )}
      </AdminCard>

      <AdminPageHeader title="Time slots" description="View and generate hourly slots" />

      <div className="flex flex-wrap gap-4 mb-4 items-end">
        <div>
          <Label className="text-xs">View date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
        </div>
        <div>
          <Label className="text-xs">Generate from</Label>
          <Input type="date" value={genStart} onChange={(e) => setGenStart(e.target.value)} className="w-40" />
        </div>
        <div>
          <Label className="text-xs">to</Label>
          <Input type="date" value={genEnd} onChange={(e) => setGenEnd(e.target.value)} className="w-40" />
        </div>
        <Button size="sm" onClick={() => generate.mutate()} disabled={generate.isPending}>
          Generate slots (10am–8pm)
        </Button>
      </div>

      <AdminFilterBar className="mb-4">
        <AdminFilterField label="Slot status">
          <AdminFilterSelect
            value={slotStatus}
            onChange={setSlotStatus}
            options={[
              { value: 'available', label: 'Available' },
              { value: 'full', label: 'Full' },
              { value: 'locked', label: 'Locked' },
            ]}
          />
        </AdminFilterField>
      </AdminFilterBar>

      <PagedDataTable
        columns={[
          { key: 'time', label: 'Time' },
          { key: 'booked', label: 'Booked' },
          { key: 'status', label: 'Status' },
          { key: 'actions', label: '' },
        ]}
        rows={filteredSlots.map((s) => ({
          time: `${new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${new Date(s.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          booked: `${s.bookedCount} / ${s.maxCapacity}`,
          status: <StatusPill status={s.status} />,
          actions: (
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => unlockSlot.mutate(s.id)}
                disabled={unlockSlot.isPending}
              >
                Unlock
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => recountSlot.mutate(s.id)}
                disabled={recountSlot.isPending}
              >
                Recount
              </Button>
            </div>
          ),
        }))}
        emptyMessage="No slots for this date — generate some above"
        pageSize={10}
      />
    </div>
  );
}
