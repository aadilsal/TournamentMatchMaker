import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { AdminUserDetail, UserRole } from '@vr-tournament/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';
import { AdminQueryError, AdminPageHeader, AdminCard, DataTable, StatusBadge, AdminFieldError } from '@/components/admin/AdminUi';
import {
  adminPasswordFormSchema,
  adminRatingFormSchema,
  validateAdminForm,
} from '@/lib/admin-form-validation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useState } from 'react';
import { GridSkeleton } from '@/components/ui/skeleton';
import { useAuthUser } from '@/hooks/useAuthUser';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toast } from '@/components/ui/toast';

const ROLE_LABELS: Record<UserRole, string> = {
  player: 'Player',
  venue_admin: 'Venue admin',
  tournament_admin: 'Tournament admin',
  superadmin: 'Superadmin',
};

export function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user: currentUser } = useAuthUser();
  const isSuperAdmin = currentUser?.role === 'superadmin';
  const askConfirm = useConfirm();

  const { data: user, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'user', id],
    queryFn: () => apiGet<AdminUserDetail>(`/admin/users/${id}?detail=true`),
    enabled: !!id,
  });

  const [role, setRole] = useState<UserRole | ''>('');
  const [rating, setRating] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [ratingError, setRatingError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();

  const invalidate = [['admin', 'user', id], ['admin', 'users']];

  const update = useAdminMutation({
    mutationFn: (body: Record<string, unknown>) => apiPatch(`/admin/users/${id}`, body),
    invalidate,
  });

  const resetPassword = useAdminMutation({
    mutationFn: (password: string) =>
      apiPost(`/admin/users/${id}/reset-password`, { password }),
    successMessage: 'Password reset. The user must sign in with the new password.',
    onSuccess: () => setNewPassword(''),
  });

  const revokeSessions = useAdminMutation({
    mutationFn: () => apiDelete(`/admin/users/${id}/sessions`),
    successMessage: 'All sessions revoked. The user has been signed out everywhere.',
  });

  const syncTier = useAdminMutation({
    mutationFn: () => apiPost(`/admin/users/${id}/sync-tier`),
    successMessage: 'Skill tier resynced from rating.',
    invalidate,
  });

  if (isLoading) return <GridSkeleton count={3} />;
  if (error || !user)
    return <AdminQueryError error={error} resource="user" onRetry={() => refetch()} />;

  const displayRole = role || user.role;
  const isSelf = currentUser?.id === user.id;

  const handleSaveRole = async () => {
    const promotingToSuper = displayRole === 'superadmin' && user.role !== 'superadmin';
    const ok = await askConfirm({
      title: `Change role to ${ROLE_LABELS[displayRole as UserRole]}?`,
      description: promotingToSuper ? (
        <>
          Superadmins have unrestricted access: they can issue Stripe refunds, change any user&apos;s role
          (including demoting you), suspend accounts, and run destructive system maintenance. Only grant
          this to people you fully trust.
        </>
      ) : (
        <>
          {user.username} will move from <strong>{ROLE_LABELS[user.role]}</strong> to{' '}
          <strong>{ROLE_LABELS[displayRole as UserRole]}</strong>. Their access to admin pages changes
          immediately on their next page load.
        </>
      ),
      confirmLabel: 'Change role',
      confirmText: promotingToSuper ? 'SUPERADMIN' : undefined,
    });
    if (ok) {
      update.mutate(
        { role: displayRole },
        {
          onSuccess: () => {
            setRole('');
            toast.success(`${user.username} is now a ${ROLE_LABELS[displayRole as UserRole]}.`);
          },
        }
      );
    }
  };

  const handleToggleSuspend = async () => {
    const suspending = !user.suspendedAt;
    const ok = await askConfirm({
      title: suspending ? `Suspend ${user.username}?` : `Unsuspend ${user.username}?`,
      description: suspending
        ? 'They will be signed out and blocked from logging in, entering tournaments, and booking slots until you unsuspend them.'
        : 'They will be able to sign in and take part in tournaments again.',
      confirmLabel: suspending ? 'Suspend account' : 'Unsuspend account',
      tone: suspending ? 'danger' : 'default',
    });
    if (ok) {
      update.mutate(
        { suspended: suspending },
        {
          onSuccess: () =>
            toast.success(suspending ? 'Account suspended.' : 'Account unsuspended.'),
        }
      );
    }
  };

  const handleRevokeSessions = async () => {
    const ok = await askConfirm({
      title: 'Revoke all sessions?',
      description: `${user.username} will be signed out on every device immediately and must log in again.`,
      confirmLabel: 'Revoke sessions',
    });
    if (ok) revokeSessions.mutate();
  };

  const handleUpdateRating = () => {
    const value = rating || String(user.ratingPoints ?? 650);
    const result = validateAdminForm(adminRatingFormSchema, { ratingPoints: value });
    if (!result.ok) {
      setRatingError(result.errors.ratingPoints);
      return;
    }
    setRatingError(undefined);
    update.mutate(
      { ratingPoints: parseInt(result.data.ratingPoints, 10) },
      { onSuccess: () => toast.success('Rating updated.') }
    );
  };

  const handleResetPassword = async () => {
    const result = validateAdminForm(adminPasswordFormSchema, { password: newPassword });
    if (!result.ok) {
      setPasswordError(result.errors.password);
      return;
    }
    setPasswordError(undefined);
    const ok = await askConfirm({
      title: `Reset password for ${user.username}?`,
      description:
        'Their current password stops working immediately. Make sure you have a secure way to give them the new one.',
      confirmLabel: 'Reset password',
    });
    if (ok) resetPassword.mutate(newPassword);
  };

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
          {user.suspendedAt && <StatusBadge status="cancelled" />}
        </AdminCard>

        {isSuperAdmin && (
          <AdminCard className="p-5 space-y-4">
            <h3 className="font-semibold text-sm">Admin controls</h3>
            <div>
              <Label className="text-xs" htmlFor="user-role">Role</Label>
              <Select
                id="user-role"
                className="mt-1"
                value={displayRole}
                onChange={(e) => setRole(e.target.value as UserRole)}
                disabled={isSelf}
              >
                {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
              {isSelf && (
                <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                  You cannot change your own role.
                </p>
              )}
              <Button
                size="sm"
                className="mt-2"
                variant="outline"
                onClick={handleSaveRole}
                disabled={displayRole === user.role || isSelf || update.isPending}
              >
                {update.isPending ? 'Saving…' : 'Save role'}
              </Button>
            </div>
            <div>
              <Label className="text-xs" htmlFor="user-rating">Rating points</Label>
              <Input
                id="user-rating"
                type="number"
                min={0}
                max={5000}
                value={rating || String(user.ratingPoints ?? 650)}
                onChange={(e) => {
                  setRating(e.target.value);
                  setRatingError(undefined);
                }}
                aria-invalid={Boolean(ratingError)}
              />
              <AdminFieldError message={ratingError} />
              <div className="flex gap-2 mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleUpdateRating}
                  disabled={update.isPending}
                >
                  Update rating
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => syncTier.mutate()}
                  disabled={syncTier.isPending}
                >
                  {syncTier.isPending ? 'Syncing…' : 'Sync tier'}
                </Button>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleToggleSuspend}
                disabled={update.isPending || isSelf}
              >
                {user.suspendedAt ? 'Unsuspend' : 'Suspend'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRevokeSessions}
                disabled={revokeSessions.isPending}
              >
                {revokeSessions.isPending ? 'Revoking…' : 'Revoke sessions'}
              </Button>
            </div>
            <div>
              <Label className="text-xs" htmlFor="user-new-password">Reset password</Label>
              <Input
                id="user-new-password"
                type="password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setPasswordError(undefined);
                }}
                placeholder="New password"
                autoComplete="new-password"
                aria-invalid={Boolean(passwordError)}
              />
              <AdminFieldError message={passwordError} />
              <Button
                size="sm"
                className="mt-2"
                variant="outline"
                onClick={handleResetPassword}
                disabled={resetPassword.isPending || !newPassword}
              >
                {resetPassword.isPending ? 'Resetting…' : 'Reset password'}
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
          status: <StatusBadge status={t.status} />,
          record: `${t.wins}–${t.losses}`,
        }))}
        emptyMessage="No tournaments"
      />
    </div>
  );
}
