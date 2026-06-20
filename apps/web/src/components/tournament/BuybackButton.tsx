import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Buyback, Tournament } from '@vr-tournament/shared';
import { apiPost } from '@/lib/api';
import { getUserErrorMessage } from '@/lib/user-messages';
import { Button } from '@/components/ui/button';
import { Heart } from 'lucide-react';

interface BuybackButtonProps {
  tournamentId: string;
  tournament: Tournament;
  matchId?: string;
  onSuccess?: () => void;
}

export function BuybackButton({ tournamentId, tournament, matchId, onSuccess }: BuybackButtonProps) {
  const queryClient = useQueryClient();

  const buyback = useMutation({
    mutationFn: () =>
      apiPost<Buyback>(`/tournaments/${tournamentId}/buyback`, matchId ? { matchId } : {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament-participant', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['matchmaking-status'] });
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['buyback-options'] });
      onSuccess?.();
    },
  });

  const price = (tournament.buybackPriceCents / 100).toFixed(2);

  return (
    <div className="space-y-2">
      <Button
        onClick={() => buyback.mutate()}
        disabled={buyback.isPending}
        className="gap-2"
        variant="outline"
      >
        <Heart className="h-4 w-4 text-red-400" />
        {buyback.isPending ? 'Processing…' : `Buy back a life — $${price}`}
      </Button>
      {buyback.isError && (
        <p className="text-xs text-[var(--color-destructive)]">{getUserErrorMessage(buyback.error)}</p>
      )}
    </div>
  );
}
