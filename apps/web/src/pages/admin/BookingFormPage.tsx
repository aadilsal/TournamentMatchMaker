import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TimeSlot, Venue } from '@vr-tournament/shared';
import { apiGet, apiPost } from '@/lib/api';
import {
  adminBookingFormSchema,
  validateAdminForm,
  type FieldErrors,
} from '@/lib/admin-form-validation';
import { AdminPageHeader, AdminCard, AdminFieldError } from '@/components/admin/AdminUi';
import { UserPicker } from '@/components/admin/UserPicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';

export function AdminBookingFormPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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

  const create = useMutation({
    mutationFn: (body: { userId: string; timeSlotId: string }) => apiPost('/admin/bookings', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'bookings'] });
      navigate('/admin/bookings');
    },
  });

  const handleSubmit = () => {
    const result = validateAdminForm(adminBookingFormSchema, { userId, timeSlotId });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    if (!venueId) {
      setErrors({ venueId: 'Select a venue' });
      return;
    }
    setErrors({});
    create.mutate(result.data);
  };

  return (
    <div>
      <AdminPageHeader title="Create booking" description="Book a slot on behalf of a user" />

      <AdminCard className="p-6 max-w-xl space-y-4">
        <div>
          <UserPicker
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
          <select
            className="w-full h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm mt-1"
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
          </select>
          <AdminFieldError message={errors.venueId} />
        </div>
        <div>
          <Label className="text-xs">Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Time slot</Label>
          <select
            className="w-full h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm mt-1"
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
            {slots
              .filter((s) => s.status !== 'full')
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {' '}({s.bookedCount}/{s.maxCapacity})
                </option>
              ))}
          </select>
          <AdminFieldError message={errors.timeSlotId} />
        </div>
        <Button onClick={handleSubmit} disabled={create.isPending}>
          Create booking
        </Button>
      </AdminCard>
    </div>
  );
}
