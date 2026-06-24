import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Buyback, Tournament } from '@vr-tournament/shared';
import { apiGet, apiPost } from '@/lib/api';
import {
  AdminCard,
  AdminFieldError,
  AdminFilterBar,
  AdminFilterField,
  AdminFilterSelect,
  AdminPageHeader,
  AdminTableFooter,
  DataTable,
  StatusPill,
} from '@/components/admin/AdminUi';
import { UserPicker } from '@/components/admin/UserPicker';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { GridSkeleton } from '@/components/ui/skeleton';
import { useAdminList } from '@/hooks/useAdminList';
import {
  adminBuybackFormSchema,
  toAdminBuybackInput,
  validateAdminForm,
  type FieldErrors,
} from '@/lib/admin-form-validation';

type BuybackRow = Buyback & { username?: string; tournamentName?: string };

export function AdminBuybacksPage() {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState('');
  const [grantTournamentId, setGrantTournamentId] = useState('');
  const [roundNumber, setRoundNumber] = useState('1');
  const [amountDollars, setAmountDollars] = useState('10');
  const [tournamentId, setTournamentId] = useState('');
  const [status, setStatus] = useState('');
  const [grantErrors, setGrantErrors] = useState<FieldErrors>({});

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

  const create = useMutation({
    mutationFn: (body: ReturnType<typeof toAdminBuybackInput>) => apiPost('/admin/buybacks', body),
    onSuccess: () => {
      setUserId('');
      setGrantTournamentId('');
      setGrantErrors({});
      queryClient.invalidateQueries({ queryKey: ['admin', 'buybacks'] });
    },
  });

  const handleGrant = () => {
    const result = validateAdminForm(adminBuybackFormSchema, {
      userId,
      tournamentId: grantTournamentId,
      roundNumber,
      amountDollars,
    });
    if (!result.ok) {
      setGrantErrors(result.errors);
      return;
    }
    setGrantErrors({});
    create.mutate(toAdminBuybackInput(result.data));
  };

  return (
    <div>
      <AdminPageHeader title="Buybacks" description="Tournament re-entry payments" />

      <AdminCard className="p-4 mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 items-end">
        <div className="sm:col-span-2">
          <UserPicker
            value={userId}
            onChange={(id) => {
              setUserId(id);
              setGrantErrors((e) => {
                const next = { ...e };
                delete next.userId;
                return next;
              });
            }}
            label="Player"
          />
          <AdminFieldError message={grantErrors.userId} />
        </div>
        <div>
          <Label className="text-xs">Tournament</Label>
          <select
            className="w-full h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm mt-1"
            value={grantTournamentId}
            onChange={(e) => {
              setGrantTournamentId(e.target.value);
              setGrantErrors((err) => {
                const next = { ...err };
                delete next.tournamentId;
                return next;
              });
            }}
          >
            <option value="">Select…</option>
            {tournaments.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <AdminFieldError message={grantErrors.tournamentId} />
        </div>
        <div>
          <Label className="text-xs">Round</Label>
          <input
            type="number"
            min={1}
            className="w-full h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm mt-1"
            value={roundNumber}
            onChange={(e) => {
              setRoundNumber(e.target.value);
              setGrantErrors((err) => {
                const next = { ...err };
                delete next.roundNumber;
                return next;
              });
            }}
          />
          <AdminFieldError message={grantErrors.roundNumber} />
        </div>
        <div>
          <Label className="text-xs">Amount ($)</Label>
          <input
            type="number"
            min={0}
            step="0.01"
            className="w-full h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm mt-1"
            value={amountDollars}
            onChange={(e) => {
              setAmountDollars(e.target.value);
              setGrantErrors((err) => {
                const next = { ...err };
                delete next.amountDollars;
                return next;
              });
            }}
          />
          <AdminFieldError message={grantErrors.amountDollars} />
        </div>
        <Button size="sm" onClick={handleGrant} disabled={create.isPending}>
          Grant buyback
        </Button>
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
