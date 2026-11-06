import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { AdminDashboardStats } from '@vr-tournament/shared';
import { apiGet } from '@/lib/api';
import { AdminPageHeader, AdminQueryError, StatCard } from '@/components/admin/AdminUi';
import { buttonVariants } from '@/components/ui/button';
import { GridSkeleton } from '@/components/ui/skeleton';
import { useAuthUser } from '@/hooks/useAuthUser';
import { canAccessAdminPath } from '@/lib/admin-routes';

export function AdminDashboardPage() {
  const role = useAuthUser().user?.role;
  const isSuperAdmin = role === 'superadmin';
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: () => apiGet<AdminDashboardStats>('/admin/dashboard'),
  });

  if (isLoading) return <GridSkeleton count={6} />;

  if (error || !data)
    return <AdminQueryError error={error} resource="dashboard" onRetry={() => refetch()} />;

  // A card shows only when this admin can open the list it counts.
  const card = (to: string, props: Omit<Parameters<typeof StatCard>[0], 'to'>) =>
    canAccessAdminPath(to.split('?')[0]!, role) ? <StatCard {...props} to={to} /> : null;
  const description = isSuperAdmin
    ? 'Platform overview and quick actions'
    : role === 'venue_admin'
      ? 'Your venue overview'
      : 'Your tournaments overview';

  return (
    <div>
      <AdminPageHeader
        title="Dashboard"
        description={description}
        actions={
          isSuperAdmin ? (
            <>
              <Link to="/admin/tournaments/new" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                New tournament
              </Link>
              <Link to="/admin/venues/new" className={buttonVariants({ size: 'sm' })}>
                New venue
              </Link>
            </>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {card('/admin/users', { label: 'Users', value: data.users, sub: `${data.players} players` })}
        {card('/admin/venues', { label: 'Venues', value: data.venues, sub: `${data.activeVenues} active` })}
        {card('/admin/matches?view=ongoing', {
          label: 'Ongoing matches',
          value: data.matches.ongoing,
          sub: `${data.matches.total} total`,
        })}
        {card('/admin/queue', { label: 'In queue', value: data.queueSize })}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {card('/admin/tournaments?status=open', {
          label: 'Open tournaments',
          value: data.tournaments.open,
          sub: `${data.tournaments.in_progress} in progress`,
        })}
        {card('/admin/bookings?status=confirmed', {
          label: 'Bookings',
          value: data.bookings.confirmed,
          sub: `${data.bookings.pending} pending`,
        })}
        {card('/admin/buybacks?status=completed', {
          label: 'Buybacks',
          value: data.buybacks.completed,
          sub: `${data.buybacks.pending} pending`,
        })}
        {card('/admin/matches?view=upcoming', { label: 'Upcoming matches', value: data.matches.upcoming })}
        {card('/admin/matches?view=past', { label: 'Past matches', value: data.matches.past })}
        {card('/admin/notifications?status=failed', {
          label: 'Failed notifications',
          value: data.notificationsFailed,
        })}
      </div>
    </div>
  );
}
