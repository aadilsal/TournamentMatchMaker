import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Match } from '@vr-tournament/shared';
import { apiGet, apiPost, apiPut } from '@/lib/api';
import { AdminQueryError, AdminPageHeader, AdminCard, StatusBadge, AdminFieldError } from '@/components/admin/AdminUi';
import {
  adminScoreOverrideSchema,
  validateAdminForm,
  type FieldErrors,
} from '@/lib/admin-form-validation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import { GridSkeleton } from '@/components/ui/skeleton';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { useConfirm } from '@/components/ui/confirm-dialog';

export function AdminMatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const askConfirm = useConfirm();
  const [p1Score, setP1Score] = useState('');
  const [p2Score, setP2Score] = useState('');
  const [scoreErrors, setScoreErrors] = useState<FieldErrors>({});

  const { data: match, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'match', id],
    queryFn: () => apiGet<Match & { tournamentName?: string }>(`/admin/matches/${id}`),
    enabled: !!id,
  });

  const invalidate = [
    ['admin', 'match', id],
    ['admin', 'matches'],
  ];

  const confirmMatch = useAdminMutation({
    mutationFn: () => apiPost(`/admin/matches/${id}/confirm`),
    successMessage: 'Match force-confirmed.',
    invalidate,
  });

  const expire = useAdminMutation({
    mutationFn: () => apiPost(`/admin/matches/${id}/expire`),
    successMessage: 'Match force-expired.',
    invalidate,
  });

  const setResult = useAdminMutation({
    mutationFn: (body: { player1Score: number; player2Score: number }) =>
      apiPut(`/admin/matches/${id}/result`, { ...body, source: 'manual' }),
    successMessage: 'Result applied. The match record now shows the override.',
    invalidate,
  });

  if (isLoading) return <GridSkeleton count={3} />;
  if (error || !match)
    return <AdminQueryError error={error} resource="match" onRetry={() => refetch()} />;

  const p1Name = match.player1?.username ?? 'Player 1';
  const p2Name = match.player2?.username ?? 'Player 2';

  const handleForceConfirm = async () => {
    const ok = await askConfirm({
      title: 'Force confirm this match?',
      description: `This marks the match confirmed on behalf of both players, bypassing their own confirmation. ${p1Name} and ${p2Name} will be notified and the match becomes playable.`,
      confirmLabel: 'Force confirm',
    });
    if (ok) confirmMatch.mutate();
  };

  const handleForceExpire = async () => {
    const ok = await askConfirm({
      title: 'Force expire this match?',
      description:
        'The match will be closed as expired and neither player can confirm or play it. This cannot be undone — a new match must be created instead.',
      confirmLabel: 'Force expire',
    });
    if (ok) expire.mutate();
  };

  const handleApplyResult = async () => {
    const result = validateAdminForm(adminScoreOverrideSchema, {
      player1Score: p1Score,
      player2Score: p2Score,
    });
    if (!result.ok) {
      setScoreErrors(result.errors);
      return;
    }
    setScoreErrors({});

    const s1 = parseInt(result.data.player1Score, 10);
    const s2 = parseInt(result.data.player2Score, 10);
    const winner = s1 === s2 ? 'a draw' : `a win for ${s1 > s2 ? p1Name : p2Name}`;
    const hasExisting = Boolean(match.result);

    const ok = await askConfirm({
      title: hasExisting ? 'Overwrite the recorded result?' : 'Apply this result?',
      description: (
        <>
          Recording <strong>{p1Name} {s1} – {s2} {p2Name}</strong>, {winner}.
          {hasExisting && ' This replaces the existing result'}
          {hasExisting && match.result?.player1Score != null && (
            <> (currently {match.result.player1Score} – {match.result.player2Score})</>
          )}
          {hasExisting && '.'} Applying a result can advance or eliminate players in the bracket.
        </>
      ),
      confirmLabel: hasExisting ? 'Overwrite result' : 'Apply result',
    });
    if (ok) setResult.mutate({ player1Score: s1, player2Score: s2 });
  };

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
            <StatusBadge status={match.status} />
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
            <Button
              size="sm"
              variant="outline"
              onClick={handleForceConfirm}
              disabled={confirmMatch.isPending}
            >
              {confirmMatch.isPending ? 'Confirming…' : 'Force confirm'}
            </Button>
            <Button size="sm" variant="outline" onClick={handleForceExpire} disabled={expire.isPending}>
              {expire.isPending ? 'Expiring…' : 'Force expire'}
            </Button>
          </div>

          <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
            <p className="text-xs font-medium text-[var(--color-muted-foreground)]">Override score</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs" htmlFor="p1-score">{p1Name}</Label>
                <Input
                  id="p1-score"
                  value={p1Score}
                  onChange={(e) => {
                    setP1Score(e.target.value);
                    setScoreErrors((prev) => ({ ...prev, player1Score: '' }));
                  }}
                  type="number"
                  min={0}
                  aria-invalid={Boolean(scoreErrors.player1Score)}
                />
                <AdminFieldError message={scoreErrors.player1Score} />
              </div>
              <div>
                <Label className="text-xs" htmlFor="p2-score">{p2Name}</Label>
                <Input
                  id="p2-score"
                  value={p2Score}
                  onChange={(e) => {
                    setP2Score(e.target.value);
                    setScoreErrors((prev) => ({ ...prev, player2Score: '' }));
                  }}
                  type="number"
                  min={0}
                  aria-invalid={Boolean(scoreErrors.player2Score)}
                />
                <AdminFieldError message={scoreErrors.player2Score} />
              </div>
            </div>
            <Button size="sm" onClick={handleApplyResult} disabled={setResult.isPending}>
              {setResult.isPending ? 'Applying…' : 'Apply result'}
            </Button>
          </div>
        </AdminCard>
      </div>
    </div>
  );
}
