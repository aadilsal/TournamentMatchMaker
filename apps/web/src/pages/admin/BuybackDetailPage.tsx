import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Buyback } from '@vr-tournament/shared';
import { apiGet, apiPost } from '@/lib/api';
import { AdminQueryError, AdminPageHeader, AdminCard, StatusBadge } from '@/components/admin/AdminUi';
import { Button } from '@/components/ui/button';
import { GridSkeleton } from '@/components/ui/skeleton';
import { useAuthUser } from '@/hooks/useAuthUser';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { useConfirm } from '@/components/ui/confirm-dialog';

type BuybackRow = Buyback & { username?: string; tournamentName?: string };

export function AdminBuybackDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthUser();
  const askConfirm = useConfirm();

  const { data: buyback, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'buyback', id],
    queryFn: () => apiGet<BuybackRow>(`/admin/buybacks/${id}`),
    enabled: !!id,
  });

  const refund = useAdminMutation({
    mutationFn: () => apiPost(`/admin/buybacks/${id}/refund`),
    successMessage: 'Refund issued via Stripe.',
    invalidate: [
      ['admin', 'buyback', id],
      ['admin', 'buybacks'],
    ],
  });

  if (isLoading) return <GridSkeleton count={2} />;
  if (error || !buyback)
    return <AdminQueryError error={error} resource="buyback" onRetry={() => refetch()} />;

  const amount = `$${(buyback.amountCents / 100).toFixed(2)}`;

  const handleRefund = async () => {
    const ok = await askConfirm({
      title: 'Refund this buyback via Stripe?',
      description: (
        <>
          This immediately refunds <strong>{amount}</strong> to {buyback.username ?? 'the player'} through
          Stripe. Money movement cannot be reversed from this panel — you would have to take a new payment.
          The player&apos;s buyback for round {buyback.roundNumber} will be marked refunded.
        </>
      ),
      confirmLabel: `Refund ${amount}`,
      confirmText: 'REFUND',
    });
    if (ok) refund.mutate();
  };

  return (
    <div>
      <AdminPageHeader
        title="Buyback detail"
        actions={
          <Link to="/admin/buybacks">
            <Button variant="outline" size="sm">← All</Button>
          </Link>
        }
      />

      <AdminCard className="p-5 space-y-3 text-sm max-w-lg">
        <div className="flex items-center gap-2">
          <StatusBadge status={buyback.status} />
        </div>
        <p><span className="text-[var(--color-muted-foreground)]">Player:</span> {buyback.username}</p>
        <p><span className="text-[var(--color-muted-foreground)]">Tournament:</span> {buyback.tournamentName}</p>
        <p><span className="text-[var(--color-muted-foreground)]">Amount:</span> ${(buyback.amountCents / 100).toFixed(2)}</p>
        <p><span className="text-[var(--color-muted-foreground)]">Round:</span> {buyback.roundNumber}</p>
        <p><span className="text-[var(--color-muted-foreground)]">Stripe PI:</span>{' '}
          {buyback.stripePaymentIntentId ?? '—'}
        </p>
        {user?.role === 'superadmin' && buyback.status === 'completed' && buyback.stripePaymentIntentId && (
          <Button
            size="sm"
            variant="destructive"
            onClick={handleRefund}
            disabled={refund.isPending}
          >
            {refund.isPending ? 'Refunding…' : 'Refund via Stripe'}
          </Button>
        )}
      </AdminCard>
    </div>
  );
}
