import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminUserDetail, UserRole } from '@vr-tournament/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';
import { AdminPageHeader, AdminCard, DataTable, StatusPill, AdminFieldError } from '@/components/admin/AdminUi';
import {
  adminPasswordFormSchema,
  adminRatingFormSchema,
  validateAdminForm,
} from '@/lib/admin-form-validation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import { GridSkeleton } from '@/components/ui/skeleton';
import { useAuthUser } from '@/hooks/useAuthUser';

export function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuthUser();
  const isSuperAdmin = currentUser?.role === 'superadmin';

  const { data: user, isLoading } = useQuery({
    queryKey: ['admin', 'user', id],
    queryFn: () => apiGet<AdminUserDetail>(`/admin/users/${id}?detail=true`),
    enabled: !!id,
  });

  const [role, setRole] = useState<UserRole | ''>('');
  const [rating, setRating] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [ratingError, setRatingError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'user', id] });

  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPatch(`/admin/users/${id}`, body),
    onSuccess: invalidate,
  });

  const resetPassword = useMutation({
    mutationFn: () => apiPost(`/admin/users/${id}/reset-password`, { password: newPassword }),
    onSuccess: () => setNewPassword(''),
  });

  const revokeSessions = useMutation({
    mutationFn: () => apiDelete(`/admin/users/${id}/sessions`),
  });

  const syncTier = useMutation({
    mutationFn: () => apiPost(`/admin/users/${id}/sync-tier`),
    onSuccess: invalidate,
  });

  if (isLoading) return <GridSkeleton count={3} />;
  if (!user) return <p>User not found</p>;

  const displayRole = role || user.role;

  return (
    <div>
      <AdminPageHeader
        title={user.username}
        description={user.email}
        actions={
          <Link to="/admin/users">
            <Button variant="outline" size="sm">← All users</Button>
          </Link>
        }
      />

      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <AdminCard className="p-5 space-y-2 text-sm">
          <p><span className="text-[var(--color-muted-foreground)]">Role:</span> {user.role}</p>
          <p><span className="text-[var(--color-muted-foreground)]">Tier:</span> {user.skillTier}</p>
          <p><span className="text-[var(--color-muted-foreground)]">Rating:</span> {user.ratingPoints}</p>
          <p><span className="text-[var(--color-muted-foreground)]">City:</span> {user.city ?? '—'}</p>
          <p><span className="text-[var(--color-muted-foreground)]">VR:</span> {user.hasVrHeadset ? 'Yes' : 'No'}</p>
          <p><span className="text-[var(--color-muted-foreground)]">Matches:</span> {user.totalMatches}</p>
          <p><span className="text-[var(--color-muted-foreground)]">Bookings:</span> {user.confirmedBookings}</p>
          {user.suspendedAt && <StatusPill status="cancelled" />}
        </AdminCard>

        {isSuperAdmin && (
          <AdminCard className="p-5 space-y-4">
            <h3 className="font-semibold text-sm">Admin controls</h3>
            <div>
              <Label className="text-xs">Role</Label>
              <select
                className="w-full h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm mt-1"
                value={displayRole}
                onChange={(e) => setRole(e.target.value as UserRole)}
              >
                <option value="player">Player</option>
                <option value="venue_admin">Venue admin</option>
                <option value="tournament_admin">Tournament admin</option>
                <option value="superadmin">Superadmin</option>
              </select>
              <Button
                size="sm"
                className="mt-2"
                variant="outline"
                onClick={() => update.mutate({ role: displayRole })}
                disabled={displayRole === user.role}
              >
                Save role
              </Button>
            </div>
            <div>
              <Label className="text-xs">Rating points</Label>
              <Input
                type="number"
                min={0}
                value={rating || String(user.ratingPoints ?? 650)}
                onChange={(e) => {
                  setRating(e.target.value);
                  setRatingError(undefined);
                }}
              />
              <AdminFieldError message={ratingError} />
              <div className="flex gap-2 mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const value = rating || String(user.ratingPoints ?? 650);
                    const result = validateAdminForm(adminRatingFormSchema, { ratingPoints: value });
                    if (!result.ok) {
                      setRatingError(result.errors.ratingPoints);
                      return;
                    }
                    setRatingError(undefined);
                    update.mutate({ ratingPoints: parseInt(result.data.ratingPoints, 10) });
                  }}
                >
                  Update rating
                </Button>
                <Button size="sm" variant="ghost" onClick={() => syncTier.mutate()}>
                  Sync tier
                </Button>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => update.mutate({ suspended: !user.suspendedAt })}
              >
                {user.suspendedAt ? 'Unsuspend' : 'Suspend'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => revokeSessions.mutate()}>
                Revoke sessions
              </Button>
            </div>
            <div>
              <Label className="text-xs">Reset password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setPasswordError(undefined);
                }}
                placeholder="New password"
              />
              <AdminFieldError message={passwordError} />
              <Button
                size="sm"
                className="mt-2"
                variant="outline"
                onClick={() => {
                  const result = validateAdminForm(adminPasswordFormSchema, { password: newPassword });
                  if (!result.ok) {
                    setPasswordError(result.errors.password);
                    return;
                  }
                  setPasswordError(undefined);
                  resetPassword.mutate();
                }}
                disabled={resetPassword.isPending}
              >
                Reset password
              </Button>
            </div>
          </AdminCard>
        )}
      </div>

      <AdminPageHeader title="Tournament history" />
      <DataTable
        columns={[
          { key: 'name', label: 'Tournament' },
          { key: 'status', label: 'Status' },
          { key: 'record', label: 'W–L' },
        ]}
        rows={user.tournaments.map((t) => ({
          name: (
            <Link to={`/admin/tournaments/${t.id}`} className="hover:underline">
              {t.name}
            </Link>
          ),
          status: <StatusPill status={t.status} />,
          record: `${t.wins}–${t.losses}`,
        }))}
        emptyMessage="No tournaments"
      />
    </div>
  );
}
