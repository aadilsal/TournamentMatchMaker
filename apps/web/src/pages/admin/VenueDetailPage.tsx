import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { TimeSlot, Venue } from '@vr-tournament/shared';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import {
  AdminQueryError,
  AdminPageHeader,
  AdminCard,
  AdminFieldError,
  AdminFilterBar,
  AdminFilterField,
  AdminFilterSelect,
  PagedDataTable,
  StatusBadge,
} from '@/components/admin/AdminUi';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  adminSlotGenerationFormSchema,
  validateAdminForm,
  type FieldErrors,
} from '@/lib/admin-form-validation';
import { UserPicker } from '@/components/admin/UserPicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import { GridSkeleton } from '@/components/ui/skeleton';

export function AdminVenueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const askConfirm = useConfirm();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [genStart, setGenStart] = useState(date);
  const [genEnd, setGenEnd] = useState(date);
  const [genErrors, setGenErrors] = useState<FieldErrors>({});
  const [slotStatus, setSlotStatus] = useState('');

  const { data: venue, isLoading, error, refetch } = useQuery({
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

  const adminsKey = [['admin', 'venue', id, 'admins']];
  const slotsKey = [['admin', 'venue', id, 'slots']];

  const assignAdmin = useAdminMutation({
    mutationFn: () => apiPost(`/admin/venues/${id}/admins`, { userId: assignUserId }),
    successMessage: 'Venue admin assigned.',
    invalidate: adminsKey,
    onSuccess: () => setAssignUserId(''),
  });

  const removeAdmin = useAdminMutation({
    mutationFn: (userId: string) => apiDelete(`/admin/venues/${id}/admins/${userId}`),
    successMessage: 'Venue admin removed.',
    invalidate: adminsKey,
  });

  const generate = useAdminMutation({
    mutationFn: (body: { startDate: string; endDate: string }) =>
      apiPost<{ created?: number }>(`/admin/venues/${id}/slots/generate`, {
        ...body,
        startHour: 10,
        endHour: 20,
      }),
    successMessage: (data) =>
      typeof data?.created === 'number'
        ? `Generated ${data.created} slot${data.created === 1 ? '' : 's'}.`
        : 'Slots generated.',
    invalidate: slotsKey,
  });

  const unlockSlot = useAdminMutation({
    mutationFn: (slotId: string) => apiPost(`/admin/slots/${slotId}/unlock`),
    successMessage: 'Slot unlocked — players can book it again.',
    invalidate: slotsKey,
  });

  const recountSlot = useAdminMutation({
    mutationFn: (slotId: string) => apiPost(`/admin/slots/${slotId}/recount`),
    successMessage: 'Booking count recalculated from live bookings.',
    invalidate: slotsKey,
  });

  if (isLoading) return <GridSkeleton count={3} />;
  if (error || !venue)
    return <AdminQueryError error={error} resource="venue" onRetry={() => refetch()} />;

  const filteredSlots = slotStatus ? slots.filter((s) => s.status === slotStatus) : slots;

  const handleGenerate = async () => {
    const result = validateAdminForm(adminSlotGenerationFormSchema, {
      startDate: genStart,
      endDate: genEnd,
    });
    if (!result.ok) {
      setGenErrors(result.errors);
      return;
    }
    setGenErrors({});

    const days =
      Math.round(
        (new Date(`${result.data.endDate}T00:00:00`).getTime() -
          new Date(`${result.data.startDate}T00:00:00`).getTime()) /
          86_400_000
      ) + 1;

    const ok = await askConfirm({
      title: `Generate slots for ${days} day${days === 1 ? '' : 's'}?`,
      description: (
        <>
          This creates hourly 10am–8pm slots at {venue.name} from{' '}
          <strong>{result.data.startDate}</strong> to <strong>{result.data.endDate}</strong> —
          roughly <strong>{days * 10} slots</strong>. Running this twice over the same dates can
          produce duplicate or overlapping slots, which players will see as repeated booking options.
        </>
      ),
      confirmLabel: 'Generate slots',
      tone: 'default',
    });
    if (ok) generate.mutate({ startDate: result.data.startDate, endDate: result.data.endDate });
  };

  const handleRemoveAdmin = async (userId: string, username: string) => {
    const ok = await askConfirm({
      title: `Remove ${username} as venue admin?`,
      description: `They will immediately lose the ability to manage ${venue.name}, including its slots and bookings.`,
      confirmLabel: 'Remove admin',
    });
    if (ok) removeAdmin.mutate(userId);
  };

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
          <Button
            size="sm"
            onClick={() => assignAdmin.mutate()}
            disabled={!assignUserId || assignAdmin.isPending}
          >
            {assignAdmin.isPending ? 'Assigning…' : 'Assign'}
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
                  className="text-[var(--color-destructive)]"
                  onClick={() => handleRemoveAdmin(a.userId, a.username)}
                  disabled={removeAdmin.isPending}
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

      <div className="flex flex-wrap gap-4 mb-4 items-start">
        <div>
          <Label className="text-xs" htmlFor="slot-view-date">View date</Label>
          <Input
            id="slot-view-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-40"
          />
        </div>
        <div>
          <Label className="text-xs" htmlFor="slot-gen-start">Generate from</Label>
          <Input
            id="slot-gen-start"
            type="date"
            value={genStart}
            onChange={(e) => {
              setGenStart(e.target.value);
              setGenErrors({});
            }}
            className="w-40"
            aria-invalid={Boolean(genErrors.startDate)}
          />
          <AdminFieldError message={genErrors.startDate} />
        </div>
        <div>
          <Label className="text-xs" htmlFor="slot-gen-end">to</Label>
          <Input
            id="slot-gen-end"
            type="date"
            value={genEnd}
            min={genStart}
            onChange={(e) => {
              setGenEnd(e.target.value);
              setGenErrors({});
            }}
            className="w-40"
            aria-invalid={Boolean(genErrors.endDate)}
          />
          <AdminFieldError message={genErrors.endDate} />
        </div>
        <Button size="sm" className="mt-5" onClick={handleGenerate} disabled={generate.isPending}>
          {generate.isPending ? 'Generating…' : 'Generate slots (10am–8pm)'}
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
          status: <StatusBadge status={s.status} />,
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
