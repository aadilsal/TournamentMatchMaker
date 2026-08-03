import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { AdminDashboardStats } from '@vr-tournament/shared';
import { apiGet } from '@/lib/api';
import { AdminPageHeader, StatCard } from '@/components/admin/AdminUi';
import { Button } from '@/components/ui/button';
import { GridSkeleton } from '@/components/ui/skeleton';

export function AdminDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: () => apiGet<AdminDashboardStats>('/admin/dashboard'),
  });

  if (isLoading) return <GridSkeleton count={6} />;

  if (!data) return null;

  return (
    <div>
      <AdminPageHeader
        title="Dashboard"
        description="Platform overview and quick actions"
        actions={
          <>
            <Link to="/admin/tournaments/new">
              <Button variant="outline" size="sm">New tournament</Button>
            </Link>
            <Link to="/admin/venues/new">
              <Button size="sm">New venue</Button>
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Users" value={data.users} sub={`${data.players} players`} to="/admin/users" />
        <StatCard
          label="Venues"
          value={data.venues}
          sub={`${data.activeVenues} active`}
          to="/admin/venues"
        />
        <StatCard
          label="Ongoing matches"
          value={data.matches.ongoing}
          sub={`${data.matches.total} total`}
          to="/admin/matches?status=in_progress"
        />
        <StatCard label="In queue" value={data.queueSize} to="/admin/queue" />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="Open tournaments"
          value={data.tournaments.open}
          sub={`${data.tournaments.in_progress} in progress`}
          to="/admin/tournaments?status=open"
        />
        <StatCard
          label="Bookings"
          value={data.bookings.confirmed}
          sub={`${data.bookings.pending} pending`}
          to="/admin/bookings?status=confirmed"
        />
        <StatCard
          label="Buybacks"
          value={data.buybacks.completed}
          sub={`${data.buybacks.pending} pending`}
          to="/admin/buybacks?status=completed"
        />
        <StatCard
          label="Upcoming matches"
          value={data.matches.upcoming}
          to="/admin/matches?status=confirmed"
        />
        <StatCard
          label="Past matches"
          value={data.matches.past}
          to="/admin/matches?status=completed"
        />
        <StatCard
          label="Failed notifications"
          value={data.notificationsFailed}
          to="/admin/notifications?status=failed"
        />
      </div>
    </div>
  );
}
