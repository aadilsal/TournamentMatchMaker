import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { TimeSlot, Venue } from '@vr-tournament/shared';
import { apiGet, apiPost } from '@/lib/api';
import {
  adminBookingFormSchema,
  toAdminBookingInput,
  validateAdminForm,
  type FieldErrors,
} from '@/lib/admin-form-validation';
import { AdminPageHeader, AdminCard, AdminFieldError } from '@/components/admin/AdminUi';
import { UserPicker } from '@/components/admin/UserPicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useState } from 'react';
import { useAdminMutation } from '@/hooks/useAdminMutation';

export function AdminBookingFormPage() {
  const navigate = useNavigate();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [userId, setUserId] = useState('');
  const [venueId, setVenueId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [timeSlotId, setTimeSlotId] = useState('');

  const { data: venues = [] } = useQuery({
    queryKey: ['admin', 'venues'],
    queryFn: () => apiGet<Venue[]>('/admin/venues'),
  });

  const { data: slots = [] } = useQuery({
    queryKey: ['admin', 'venue', venueId, 'slots', date],
    queryFn: () => apiGet<TimeSlot[]>(`/admin/venues/${venueId}/slots?date=${date}`),
    enabled: !!venueId,
  });

  const create = useAdminMutation({
    mutationFn: (body: { userId: string; timeSlotId: string }) => apiPost('/admin/bookings', body),
    successMessage: 'Booking created.',
    invalidate: [['admin', 'bookings']],
    onSuccess: () => navigate('/admin/bookings'),
  });

  // 'full' slots can't take another booking; 'locked' ones are mid-transaction.
  const bookableSlots = slots.filter((s) => s.status === 'available');

  const handleSubmit = () => {
    const result = validateAdminForm(adminBookingFormSchema, { userId, venueId, timeSlotId });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    create.mutate(toAdminBookingInput(result.data));
  };

  return (
    <div>
      <AdminPageHeader title="Create booking" description="Book a slot on behalf of a user" />

      <AdminCard className="p-6 max-w-xl space-y-4">
        <div>
          <UserPicker
            error={errors.userId}
            value={userId}
            onChange={(id) => {
              setUserId(id);
              setErrors((e) => {
                const next = { ...e };
                delete next.userId;
                return next;
              });
            }}
          />
          <AdminFieldError message={errors.userId} />
        </div>
        <div>
          <Label className="text-xs">Venue</Label>
          <Select
            className="mt-1"
            value={venueId}
            onChange={(e) => {
              setVenueId(e.target.value);
              setTimeSlotId('');
              setErrors((e) => {
                const next = { ...e };
                delete next.venueId;
                return next;
              });
            }}
          >
            <option value="">Select venue…</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </Select>
          <AdminFieldError message={errors.venueId} />
        </div>
        <div>
          <Label className="text-xs">Date</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              // Slots are per-date; keeping the old id would submit a slot from another day.
              setTimeSlotId('');
            }}
          />
        </div>
        <div>
          <Label className="text-xs">Time slot</Label>
          <Select
            className="mt-1"
            value={timeSlotId}
            onChange={(e) => {
              setTimeSlotId(e.target.value);
              setErrors((err) => {
                const next = { ...err };
                delete next.timeSlotId;
                return next;
              });
            }}
            disabled={!venueId}
          >
            <option value="">Select slot…</option>
            {bookableSlots.map((s) => (
              <option key={s.id} value={s.id}>
                {new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {' '}({s.bookedCount}/{s.maxCapacity})
              </option>
            ))}
          </Select>
          {venueId && bookableSlots.length === 0 && (
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              {slots.length === 0
                ? 'No slots exist for this date — generate them on the venue page first.'
                : 'Every slot on this date is full or locked. Try another date.'}
            </p>
          )}
          <AdminFieldError message={errors.timeSlotId} />
        </div>
        <AdminFieldError message={errors._form} />
        <Button onClick={handleSubmit} disabled={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create booking'}
        </Button>
      </AdminCard>
    </div>
  );
}
