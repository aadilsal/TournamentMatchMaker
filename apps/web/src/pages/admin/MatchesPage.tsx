import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Match, Tournament } from '@vr-tournament/shared';
import { apiGet } from '@/lib/api';
import {
  AdminFilterBar,
  AdminFilterField,
  AdminFilterSelect,
  AdminPageHeader,
  AdminTableFooter,
  DataTable,
  StatusPill,
} from '@/components/admin/AdminUi';
import { Tabs } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { GridSkeleton } from '@/components/ui/skeleton';
import { useAdminList } from '@/hooks/useAdminList';

type View = 'ongoing' | 'upcoming' | 'past' | 'all';

interface MatchRow extends Match {
  tournamentName?: string | null;
}

export function AdminMatchesPage() {
  const [view, setView] = useState<View>('ongoing');
  const [status, setStatus] = useState('');
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
        description="All matches across the platform"
        actions={
          <Link to="/admin/matches/new">
            <Button size="sm">Create match</Button>
          </Link>
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

      {list.isLoading ? (
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
                <Link to={`/admin/matches/${m.id}`} className="hover:underline font-medium">
                  {m.player1?.username} vs {m.player2?.username}
                </Link>
              ),
              tournament: m.tournamentName ?? '—',
              status: <StatusPill status={m.status} />,
              round: m.roundNumber ?? '—',
              venue: m.venue?.name ?? '—',
              scheduled: m.scheduledAt
                ? new Date(m.scheduledAt).toLocaleString()
                : m.slot?.startTime
                  ? new Date(m.slot.startTime).toLocaleString()
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
