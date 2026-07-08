import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Buyback, Tournament } from '@vr-tournament/shared';
import { apiGet } from '@/lib/api';
import {
  AdminCard,
  AdminFilterBar,
  AdminFilterField,
  AdminFilterSelect,
  AdminPageHeader,
  AdminTableFooter,
  DataTable,
  StatusPill,
} from '@/components/admin/AdminUi';
import { GridSkeleton } from '@/components/ui/skeleton';
import { useAdminList } from '@/hooks/useAdminList';

type BuybackRow = Buyback & { username?: string; tournamentName?: string };

export function AdminBuybacksPage() {
  const [tournamentId, setTournamentId] = useState('');
  const [status, setStatus] = useState('');

  const list = useAdminList<BuybackRow>({
    queryKey: ['admin', 'buybacks'],
    path: '/admin/buybacks',
    filters: {
      tournamentId: tournamentId || undefined,
      status: status || undefined,
    },
  });

  const { data: tournaments = [] } = useQuery({
    queryKey: ['admin', 'tournaments', 'all'],
    queryFn: () => apiGet<Tournament[]>('/admin/tournaments?limit=100'),
  });

  return (
    <div>
      <AdminPageHeader
        title="Buybacks"
        description="Stripe buyback payments — players purchase re-entry from the web app"
      />

      <AdminCard className="p-4 mb-6 text-sm text-[var(--color-muted-foreground)]">
        Buybacks are created when a player starts checkout and are completed only after Stripe
        confirms payment via webhook. Admins can review records here and issue refunds for paid
        buybacks.
      </AdminCard>

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
              { value: 'completed', label: 'Completed' },
              { value: 'pending', label: 'Pending' },
              { value: 'failed', label: 'Failed' },
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
              { key: 'user', label: 'Player' },
              { key: 'tournament', label: 'Tournament' },
              { key: 'amount', label: 'Amount' },
              { key: 'status', label: 'Status' },
              { key: 'round', label: 'Round' },
            ]}
            rows={list.items.map((b) => ({
              user: (
                <Link to={`/admin/buybacks/${b.id}`} className="hover:underline">
                  {b.username ?? b.userId.slice(0, 8)}
                </Link>
              ),
              tournament: b.tournamentName ?? '—',
              amount: `$${(b.amountCents / 100).toFixed(2)}`,
              status: <StatusPill status={b.status} />,
              round: b.roundNumber,
            }))}
            emptyMessage="No buybacks match your filters"
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
