import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Tournament } from '@vr-tournament/shared';
import {
  AdminQueryError,
  AdminFilterBar,
  AdminFilterField,
  AdminFilterSearch,
  AdminFilterSelect,
  AdminPageHeader,
  AdminTableFooter,
  DataTable,
  StatusBadge,
} from '@/components/admin/AdminUi';
import { buttonVariants } from '@/components/ui/button';
import { useAuthUser } from '@/hooks/useAuthUser';
import { formatDate } from '@/lib/format';
import { GridSkeleton } from '@/components/ui/skeleton';
import { useAdminList } from '@/hooks/useAdminList';

export function AdminTournamentsPage() {
  const [search, setSearch] = useState('');
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState(() => searchParams.get('status') ?? '');
  const isSuperAdmin = useAuthUser().user?.role === 'superadmin';
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
        description={isSuperAdmin ? 'Create and manage tournaments' : 'Manage your tournaments'}
        actions={
          isSuperAdmin ? (
            <Link to="/admin/tournaments/new" className={buttonVariants({ size: 'sm' })}>
              Create tournament
            </Link>
          ) : undefined
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
              { value: 'closed', label: 'Registration closed' },
              { value: 'in_progress', label: 'Live' },
              { value: 'completed', label: 'Completed' },
            ]}
          />
        </AdminFilterField>
        <AdminFilterField label="Phase">
          <AdminFilterSelect
            value={phase}
            onChange={setPhase}
            options={[
              { value: 'normal', label: 'Normal rounds' },
              { value: 'knockout', label: 'Knockout' },
              { value: 'completed', label: 'Completed' },
            ]}
          />
        </AdminFilterField>
      </AdminFilterBar>

      {list.error ? (
        <AdminQueryError error={list.error} resource="tournaments" onRetry={() => list.refetch()} />
      ) : list.isLoading ? (
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
                <Link to={`/admin/tournaments/${t.id}`} className="inline-flex min-h-10 items-center font-medium hover:underline">
                  {t.name}
                </Link>
              ),
              status: <StatusBadge status={t.status} />,
              phase: <StatusBadge status={t.phase} />,
              players: `${t.registrationCount ?? 0}${t.maxPlayers ? ` / ${t.maxPlayers}` : ''}`,
              dates: `${formatDate(t.startDate)} – ${formatDate(t.endDate)}`,
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
