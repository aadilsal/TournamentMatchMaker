import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Tournament } from '@vr-tournament/shared';
import {
  AdminFilterBar,
  AdminFilterField,
  AdminFilterSearch,
  AdminFilterSelect,
  AdminPageHeader,
  AdminTableFooter,
  DataTable,
  StatusPill,
} from '@/components/admin/AdminUi';
import { Button } from '@/components/ui/button';
import { GridSkeleton } from '@/components/ui/skeleton';
import { useAdminList } from '@/hooks/useAdminList';

export function AdminTournamentsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [phase, setPhase] = useState('');

  const list = useAdminList<Tournament>({
    queryKey: ['admin', 'tournaments'],
    path: '/admin/tournaments',
    filters: {
      search: search || undefined,
      status: status || undefined,
      phase: phase || undefined,
    },
  });

  return (
    <div>
      <AdminPageHeader
        title="Tournaments"
        description="Create and manage tournaments"
        actions={
          <Link to="/admin/tournaments/new">
            <Button size="sm">Create tournament</Button>
          </Link>
        }
      />

      <AdminFilterBar>
        <AdminFilterField label="Search" className="min-w-[200px] flex-1">
          <AdminFilterSearch value={search} onChange={setSearch} placeholder="Name or game…" />
        </AdminFilterField>
        <AdminFilterField label="Status">
          <AdminFilterSelect
            value={status}
            onChange={setStatus}
            options={[
              { value: 'draft', label: 'Draft' },
              { value: 'open', label: 'Open' },
              { value: 'closed', label: 'Closed' },
              { value: 'in_progress', label: 'In progress' },
              { value: 'completed', label: 'Completed' },
            ]}
          />
        </AdminFilterField>
        <AdminFilterField label="Phase">
          <AdminFilterSelect
            value={phase}
            onChange={setPhase}
            options={[
              { value: 'normal', label: 'Normal' },
              { value: 'knockout', label: 'Knockout' },
              { value: 'completed', label: 'Completed' },
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
              { key: 'name', label: 'Name' },
              { key: 'status', label: 'Status' },
              { key: 'phase', label: 'Phase' },
              { key: 'players', label: 'Registered' },
              { key: 'dates', label: 'Dates' },
            ]}
            rows={list.items.map((t) => ({
              name: (
                <Link to={`/admin/tournaments/${t.id}`} className="font-medium hover:underline">
                  {t.name}
                </Link>
              ),
              status: <StatusPill status={t.status} />,
              phase: <StatusPill status={t.phase} />,
              players: `${t.registrationCount ?? 0}${t.maxPlayers ? ` / ${t.maxPlayers}` : ''}`,
              dates: `${new Date(t.startDate).toLocaleDateString()} – ${new Date(t.endDate).toLocaleDateString()}`,
            }))}
            emptyMessage="No tournaments match your filters"
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
