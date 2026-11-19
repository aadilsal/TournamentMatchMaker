import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Venue, VenuePlayer } from '@vr-tournament/shared';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import {
  AdminQueryError,
  AdminPageHeader,
  AdminCard,
  PagedDataTable,
  StatusBadge,
} from '@/components/admin/AdminUi';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { UserPicker } from '@/components/admin/UserPicker';
import { Button, buttonVariants } from '@/components/ui/button';
import { useAuthUser } from '@/hooks/useAuthUser';
import { useState } from 'react';
import { GridSkeleton } from '@/components/ui/skeleton';

export function AdminVenueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const askConfirm = useConfirm();
  const isSuperAdmin = useAuthUser().user?.role === 'superadmin';

  const { data: venue, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'venue', id],
    queryFn: () => apiGet<Venue>(`/admin/venues/${id}`),
    enabled: !!id,
  });

  const {
    data: players = [],
    isLoading: playersLoading,
    error: playersError,
    refetch: refetchPlayers,
  } = useQuery({
    queryKey: ['admin', 'venue', id, 'players'],
    queryFn: () => apiGet<VenuePlayer[]>(`/admin/venues/${id}/players`),
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

  if (isLoading) return <GridSkeleton count={3} />;
  if (error || !venue)
    return (
      <AdminQueryError
        error={error}
        resource="venue"
        onRetry={() => refetch()}
        backTo={{ href: '/admin/venues', label: 'All venues' }}
      />
    );

  const handleRemoveAdmin = async (userId: string, username: string) => {
    const ok = await askConfirm({
      title: `Remove ${username} as venue admin?`,
      description: `They will immediately lose the ability to manage ${venue.name}, including who plays there.`,
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
            <Link to={`/admin/venues/${id}/edit`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              Edit
            </Link>
            <Link to="/admin/venues" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              ← All
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
      <AdminCard className="p-4 mb-6 space-y-4 overflow-visible">
        {isSuperAdmin && (
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
        )}
        {admins.length > 0 ? (
          <ul className="text-sm space-y-2">
            {admins.map((a) => (
              <li key={a.userId} className="flex flex-wrap justify-between items-center gap-2">
                <span className="min-w-0 break-all">{a.username} ({a.email})</span>
                {isSuperAdmin && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-[var(--color-destructive)]"
                  onClick={() => handleRemoveAdmin(a.userId, a.username)}
                  disabled={removeAdmin.isPending}
                >
                  Remove
                </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--color-muted-foreground)]">No venue admins assigned</p>
        )}
      </AdminCard>

      <AdminPageHeader
        title="Players at this venue"
        description="Players who chose this venue for an open or live tournament"
      />
      {playersError ? (
        <AdminQueryError error={playersError} resource="players" onRetry={() => refetchPlayers()} />
      ) : playersLoading ? (
        <GridSkeleton count={2} />
      ) : (
        <PagedDataTable
          columns={[
            { key: 'player', label: 'Player' },
            { key: 'tournament', label: 'Tournament' },
            { key: 'status', label: 'Status' },
          ]}
          rows={players.map((p) => ({
            player: p.username,
            tournament: (
              <Link to={`/admin/tournaments/${p.tournamentId}`} className="hover:underline">
                {p.tournamentName}
              </Link>
            ),
            status: <StatusBadge status={p.tournamentStatus === 'open' ? 'registered' : p.participantStatus ?? 'registered'} />,
          }))}
          emptyMessage="No players have chosen this venue for an open or live tournament yet"
          pageSize={20}
        />
      )}
    </div>
  );
}
