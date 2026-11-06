import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Match, Tournament } from '@vr-tournament/shared';
import { apiGet } from '@/lib/api';
import {
  AdminQueryError,
  AdminFilterBar,
  AdminFilterField,
  AdminFilterSelect,
  AdminPageHeader,
  AdminTableFooter,
  DataTable,
  StatusBadge,
} from '@/components/admin/AdminUi';
import { Tabs } from '@/components/ui/tabs';
import { buttonVariants } from '@/components/ui/button';
import { useAuthUser } from '@/hooks/useAuthUser';
import { formatDateTime } from '@/lib/format';
import { GridSkeleton } from '@/components/ui/skeleton';
import { useAdminList } from '@/hooks/useAdminList';

type View = 'ongoing' | 'upcoming' | 'past' | 'all';

interface MatchRow extends Match {
  tournamentName?: string | null;
}

export function AdminMatchesPage() {
  const [searchParams] = useSearchParams();
  const initialStatus = searchParams.get('status') ?? '';
  const viewParam = searchParams.get('view');
  const initialView = (['ongoing', 'upcoming', 'past', 'all'] as const).find((v) => v === viewParam);
  // A status deep link (dashboard cards) must not be narrowed further by the default tab.
  const [view, setView] = useState<View>(initialView ?? (initialStatus ? 'all' : 'ongoing'));
  const [status, setStatus] = useState(initialStatus);
  const isSuperAdmin = useAuthUser().user?.role === 'superadmin';
  const [tournamentId, setTournamentId] = useState('');

  const { data: tournaments = [] } = useQuery({
    queryKey: ['admin', 'tournaments', 'all'],
    queryFn: () => apiGet<Tournament[]>('/admin/tournaments?limit=100'),
  });

  const list = useAdminList<MatchRow>({
    queryKey: ['admin', 'matches'],
    path: '/admin/matches',
    filters: {
      view,
      status: status || undefined,
      tournamentId: tournamentId || undefined,
    },
  });

  return (
    <div>
      <AdminPageHeader
        title="Matches"
        description={isSuperAdmin ? 'All matches across the platform' : 'Matches in your tournaments'}
        actions={
          isSuperAdmin ? (
            <Link to="/admin/matches/new" className={buttonVariants({ size: 'sm' })}>
              Create match
            </Link>
          ) : undefined
        }
      />

      <Tabs
        className="mb-4"
        active={view}
        onChange={(id) => setView(id as View)}
        tabs={[
          { id: 'ongoing', label: 'Ongoing' },
          { id: 'upcoming', label: 'Upcoming' },
          { id: 'past', label: 'Past' },
          { id: 'all', label: 'All' },
        ]}
      />

      <AdminFilterBar>
        <AdminFilterField label="Tournament" className="min-w-[180px]">
          <AdminFilterSelect
            value={tournamentId}
            onChange={setTournamentId}
            options={tournaments.map((t) => ({ value: t.id, label: t.name }))}
          />
        </AdminFilterField>
        <AdminFilterField label="Status">
          <AdminFilterSelect
            value={status}
            onChange={setStatus}
            options={[
              { value: 'pending_confirmation', label: 'Pending confirmation' },
              { value: 'confirmed', label: 'Confirmed' },
              { value: 'in_progress', label: 'In progress' },
              { value: 'completed', label: 'Completed' },
              { value: 'cancelled', label: 'Cancelled' },
              { value: 'expired', label: 'Expired' },
            ]}
          />
        </AdminFilterField>
      </AdminFilterBar>

      {list.error ? (
        <AdminQueryError error={list.error} resource="matches" onRetry={() => list.refetch()} />
      ) : list.isLoading ? (
        <GridSkeleton count={4} />
      ) : (
        <>
          <DataTable
            columns={[
              { key: 'players', label: 'Players' },
              { key: 'tournament', label: 'Tournament' },
              { key: 'status', label: 'Status' },
              { key: 'round', label: 'Round' },
              { key: 'venue', label: 'Venue' },
              { key: 'scheduled', label: 'Scheduled' },
            ]}
            rows={list.items.map((m) => ({
              players: (
                <Link to={`/admin/matches/${m.id}`} className="inline-flex min-h-10 items-center font-medium hover:underline">
                  {m.player1?.username} vs {m.player2?.username}
                </Link>
              ),
              tournament: m.tournamentName ?? '—',
              status: <StatusBadge status={m.status} />,
              round: m.roundNumber ?? '—',
              venue: m.venue?.name ?? '—',
              scheduled: m.scheduledAt
                ? formatDateTime(m.scheduledAt)
                : m.slot?.startTime
                  ? formatDateTime(m.slot.startTime)
                  : '—',
            }))}
            emptyMessage="No matches match your filters"
          />
          <AdminTableFooter
            count={list.items.length}
            pageIndex={list.pageIndex}
            limit={list.limit}
            canPrev={list.canPrev}
            canNext={list.canNext}
            isFetching={list.isFetching}
            onPrev={list.prevPage}
            onNext={list.nextPage}
            onLimitChange={list.setLimit}
          />
        </>
      )}
    </div>
  );
}
