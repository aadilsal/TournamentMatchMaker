import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { Venue } from '@vr-tournament/shared';
import { apiGet, apiPatch, apiPost } from '@/lib/api';
import {
  adminVenueFormSchema,
  toVenueApiBody,
  validateAdminForm,
  type FieldErrors,
} from '@/lib/admin-form-validation';
import { AdminPageHeader, AdminCard, AdminFieldError } from '@/components/admin/AdminUi';
import { VenueLocationFields } from '@/components/admin/VenueLocationFields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState, useEffect } from 'react';

export function AdminVenueFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id && id !== 'new';
  const navigate = useNavigate();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [form, setForm] = useState({
    name: '',
    address: '',
    city: '',
    country: '',
    latitude: '',
    longitude: '',
    capacity: '10',
    active: true,
  });

  const { data: venue } = useQuery({
    queryKey: ['admin', 'venue', id],
    queryFn: () => apiGet<Venue>(`/admin/venues/${id}`),
    enabled: isEdit,
  });

  useEffect(() => {
    if (venue) {
      setForm({
        name: venue.name,
        address: venue.address,
        city: venue.city,
        country: venue.country,
        latitude: String(venue.latitude),
        longitude: String(venue.longitude),
        capacity: String(venue.capacity),
        active: venue.active,
      });
    }
  }, [venue]);

  const save = useMutation({
    mutationFn: async (body: ReturnType<typeof toVenueApiBody>) => {
      if (isEdit) return apiPatch<Venue>(`/admin/venues/${id}`, body);
      return apiPost<Venue>('/admin/venues', body);
    },
    onSuccess: (v) => navigate(`/admin/venues/${v.id}`),
  });

  const set = (key: string, value: string | boolean) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      const next = { ...e };
      delete next[key];
      return next;
    });
  };

  const handleSubmit = () => {
    const result = validateAdminForm(adminVenueFormSchema, form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    save.mutate(toVenueApiBody(result.data));
  };

  return (
    <div>
      <AdminPageHeader title={isEdit ? 'Edit venue' : 'Create venue'} />

      <AdminCard className="p-6 max-w-xl space-y-4">
        <div>
          <Label>Name</Label>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={255} />
          <AdminFieldError message={errors.name} />
        </div>
        <div>
          <Label>Address</Label>
          <Input value={form.address} onChange={(e) => set('address', e.target.value)} />
          <AdminFieldError message={errors.address} />
        </div>

        <VenueLocationFields
          country={form.country}
          city={form.city}
          latitude={form.latitude}
          longitude={form.longitude}
          onCountryChange={(country) => {
            setForm((f) => ({ ...f, country, city: '', latitude: '', longitude: '' }));
            setErrors((e) => {
              const next = { ...e };
              delete next.country;
              delete next.city;
              delete next.latitude;
              delete next.longitude;
              return next;
            });
          }}
          onCityChange={(city) => set('city', city)}
          onCoordsChange={(latitude, longitude) =>
            setForm((f) => ({ ...f, latitude, longitude }))
          }
        />
        <AdminFieldError message={errors.country || errors.city || errors.latitude || errors.longitude} />

        <div>
          <Label>Capacity</Label>
          <Input type="number" min={1} value={form.capacity} onChange={(e) => set('capacity', e.target.value)} />
          <AdminFieldError message={errors.capacity} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => set('active', e.target.checked)}
          />
          Active
        </label>
        <Button onClick={handleSubmit} disabled={save.isPending}>
          {isEdit ? 'Save' : 'Create venue'}
        </Button>
      </AdminCard>
    </div>
  );
}
