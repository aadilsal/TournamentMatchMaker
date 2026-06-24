import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Buyback } from '@vr-tournament/shared';
import { apiGet, apiPost } from '@/lib/api';
import { AdminPageHeader, AdminCard, StatusPill } from '@/components/admin/AdminUi';
import { Button } from '@/components/ui/button';
import { GridSkeleton } from '@/components/ui/skeleton';
import { useAuthUser } from '@/hooks/useAuthUser';

type BuybackRow = Buyback & { username?: string; tournamentName?: string };

export function AdminBuybackDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { user } = useAuthUser();

  const { data: buyback, isLoading } = useQuery({
    queryKey: ['admin', 'buyback', id],
    queryFn: () => apiGet<BuybackRow>(`/admin/buybacks/${id}`),
    enabled: !!id,
  });

  const refund = useMutation({
    mutationFn: () => apiPost(`/admin/buybacks/${id}/refund`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'buyback', id] }),
  });

  if (isLoading) return <GridSkeleton count={2} />;
  if (!buyback) return <p>Buyback not found</p>;

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
          <StatusPill status={buyback.status} />
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
            onClick={() => refund.mutate()}
            disabled={refund.isPending}
          >
            Refund via Stripe
          </Button>
        )}
      </AdminCard>
    </div>
  );
}
