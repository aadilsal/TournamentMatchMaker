import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Match } from '@vr-tournament/shared';
import { apiGet, apiPost, apiPut } from '@/lib/api';
import { AdminPageHeader, AdminCard, StatusPill } from '@/components/admin/AdminUi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import { GridSkeleton } from '@/components/ui/skeleton';

export function AdminMatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [p1Score, setP1Score] = useState('');
  const [p2Score, setP2Score] = useState('');

  const { data: match, isLoading } = useQuery({
    queryKey: ['admin', 'match', id],
    queryFn: () => apiGet<Match & { tournamentName?: string }>(`/admin/matches/${id}`),
    enabled: !!id,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'match', id] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'matches'] });
  };

  const confirm = useMutation({
    mutationFn: () => apiPost(`/admin/matches/${id}/confirm`),
    onSuccess: invalidate,
  });

  const expire = useMutation({
    mutationFn: () => apiPost(`/admin/matches/${id}/expire`),
    onSuccess: invalidate,
  });

  const setResult = useMutation({
    mutationFn: () =>
      apiPut(`/admin/matches/${id}/result`, {
        player1Score: parseInt(p1Score, 10),
        player2Score: parseInt(p2Score, 10),
        source: 'manual',
      }),
    onSuccess: invalidate,
  });

  if (isLoading) return <GridSkeleton count={3} />;
  if (!match) return <p>Match not found</p>;

  return (
    <div>
      <AdminPageHeader
        title={`${match.player1?.username} vs ${match.player2?.username}`}
        description={match.tournamentName ?? 'Casual match'}
        actions={
          <Link to="/admin/matches">
            <Button variant="outline" size="sm">← Back</Button>
          </Link>
        }
      />

      <div className="grid lg:grid-cols-2 gap-4">
        <AdminCard className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--color-muted-foreground)]">Status</span>
            <StatusPill status={match.status} />
          </div>
          <p className="text-sm">
            <span className="text-[var(--color-muted-foreground)]">Venue:</span>{' '}
            {match.venue?.name ?? '—'}
          </p>
          <p className="text-sm">
            <span className="text-[var(--color-muted-foreground)]">Round:</span>{' '}
            {match.roundNumber ?? '—'} ({match.phase ?? '—'})
          </p>
          {match.result && (
            <p className="text-sm">
              Score: {match.result.player1Score ?? '—'} – {match.result.player2Score ?? '—'}
              {match.result.winnerId && (
                <span className="text-[var(--color-muted-foreground)]">
                  {' '}
                  · Winner:{' '}
                  {match.result.winnerId === match.player1Id
                    ? match.player1?.username
                    : match.player2?.username}
                </span>
              )}
            </p>
          )}
          {match.confirmations && (
            <p className="text-xs text-[var(--color-muted-foreground)]">
              P1 confirmed: {match.confirmations.player1Confirmed ? 'yes' : 'no'} · P2 confirmed:{' '}
              {match.confirmations.player2Confirmed ? 'yes' : 'no'}
            </p>
          )}
        </AdminCard>

        <AdminCard className="p-5 space-y-4">
          <h3 className="font-semibold text-sm">Admin actions</h3>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => confirm.mutate()} disabled={confirm.isPending}>
              Force confirm
            </Button>
            <Button size="sm" variant="outline" onClick={() => expire.mutate()} disabled={expire.isPending}>
              Force expire
            </Button>
          </div>

          <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
            <p className="text-xs font-medium text-[var(--color-muted-foreground)]">Override score</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">{match.player1?.username}</Label>
                <Input value={p1Score} onChange={(e) => setP1Score(e.target.value)} type="number" />
              </div>
              <div>
                <Label className="text-xs">{match.player2?.username}</Label>
                <Input value={p2Score} onChange={(e) => setP2Score(e.target.value)} type="number" />
              </div>
            </div>
            <Button size="sm" onClick={() => setResult.mutate()} disabled={setResult.isPending}>
              Apply result
            </Button>
          </div>
        </AdminCard>
      </div>
    </div>
  );
}
