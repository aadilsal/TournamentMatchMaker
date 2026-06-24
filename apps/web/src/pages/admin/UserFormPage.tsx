import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import type { UserRole } from '@vr-tournament/shared';
import { apiPost } from '@/lib/api';
import {
  adminUserFormSchema,
  toAdminCreateUserInput,
  validateAdminForm,
  type FieldErrors,
} from '@/lib/admin-form-validation';
import { AdminPageHeader, AdminCard, AdminFieldError, AdminSkillTierSelect } from '@/components/admin/AdminUi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';

export function AdminUserFormPage() {
  const navigate = useNavigate();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [form, setForm] = useState({
    email: '',
    password: '',
    username: '',
    country: '',
    city: '',
    role: 'player' as UserRole,
    skillTier: '3',
    hasVrHeadset: false,
  });

  const create = useMutation({
    mutationFn: (body: ReturnType<typeof toAdminCreateUserInput>) => apiPost<{ id: string }>('/admin/users', body),
    onSuccess: (user) => navigate(`/admin/users/${user.id}`),
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
    const result = validateAdminForm(adminUserFormSchema, form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    create.mutate(toAdminCreateUserInput(result.data));
  };

  return (
    <div>
      <AdminPageHeader title="Create user" description="Add a new player or admin account" />

      <AdminCard className="p-6 max-w-xl space-y-4">
        <div>
          <Label>Email</Label>
          <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          <AdminFieldError message={errors.email} />
        </div>
        <div>
          <Label>Username</Label>
          <Input value={form.username} onChange={(e) => set('username', e.target.value)} />
          <AdminFieldError message={errors.username} />
        </div>
        <div>
          <Label>Password</Label>
          <Input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} />
          <AdminFieldError message={errors.password} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>City</Label>
            <Input value={form.city} onChange={(e) => set('city', e.target.value)} maxLength={100} />
            <AdminFieldError message={errors.city} />
          </div>
          <div>
            <Label>Country</Label>
            <Input value={form.country} onChange={(e) => set('country', e.target.value)} maxLength={100} />
            <AdminFieldError message={errors.country} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Role</Label>
            <select
              className="w-full h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm"
              value={form.role}
              onChange={(e) => set('role', e.target.value)}
            >
              <option value="player">Player</option>
              <option value="venue_admin">Venue admin</option>
              <option value="tournament_admin">Tournament admin</option>
              <option value="superadmin">Superadmin</option>
            </select>
            <AdminFieldError message={errors.role} />
          </div>
          <div>
            <Label>Skill tier</Label>
            <AdminSkillTierSelect value={form.skillTier} onChange={(v) => set('skillTier', v)} />
            <AdminFieldError message={errors.skillTier} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.hasVrHeadset}
            onChange={(e) => set('hasVrHeadset', e.target.checked)}
          />
          Has VR headset
        </label>
        <AdminFieldError message={errors._form} />
        <Button onClick={handleSubmit} disabled={create.isPending}>
          Create user
        </Button>
      </AdminCard>
    </div>
  );
}
