import { useNavigate } from 'react-router-dom';
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
import { Select } from '@/components/ui/select';
import { useState } from 'react';
import { useAdminMutation } from '@/hooks/useAdminMutation';

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

  const create = useAdminMutation({
    mutationFn: (body: ReturnType<typeof toAdminCreateUserInput>) => apiPost<{ id: string }>('/admin/users', body),
    successMessage: 'User created.',
    invalidate: [['admin', 'users']],
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
          <Label htmlFor="user-email">Email</Label>
          <Input id="user-email" type="email" autoComplete="off" value={form.email} onChange={(e) => set('email', e.target.value)} />
          <AdminFieldError message={errors.email} />
        </div>
        <div>
          <Label htmlFor="user-username">Username</Label>
          <Input id="user-username" value={form.username} onChange={(e) => set('username', e.target.value)} />
          <AdminFieldError message={errors.username} />
        </div>
        <div>
          <Label htmlFor="user-password">Password</Label>
          <Input id="user-password" type="password" autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} />
          <AdminFieldError message={errors.password} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="user-city">City</Label>
            <Input id="user-city" value={form.city} onChange={(e) => set('city', e.target.value)} maxLength={100} />
            <AdminFieldError message={errors.city} />
          </div>
          <div>
            <Label htmlFor="user-country">Country</Label>
            <Input id="user-country" value={form.country} onChange={(e) => set('country', e.target.value)} maxLength={100} />
            <AdminFieldError message={errors.country} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="user-role">Role</Label>
            <Select
              id="user-role"
              value={form.role}
              onChange={(e) => set('role', e.target.value)}
            >
              <option value="player">Player</option>
              <option value="venue_admin">Venue admin</option>
              <option value="tournament_admin">Tournament admin</option>
              <option value="superadmin">Superadmin</option>
            </Select>
            <AdminFieldError message={errors.role} />
          </div>
          <div>
            <Label htmlFor="user-skill-tier">Skill tier</Label>
            <AdminSkillTierSelect id="user-skill-tier" value={form.skillTier} onChange={(v) => set('skillTier', v)} />
            <AdminFieldError message={errors.skillTier} />
          </div>
        </div>
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={form.hasVrHeadset}
            onChange={(e) => set('hasVrHeadset', e.target.checked)}
          />
          Has VR headset
        </label>
        <AdminFieldError message={errors._form} />
        <Button onClick={handleSubmit} disabled={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create user'}
        </Button>
      </AdminCard>
    </div>
  );
}
