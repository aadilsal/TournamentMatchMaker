import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Buyback, Tournament } from '@vr-tournament/shared';
import { apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Heart } from 'lucide-react';

interface BuybackButtonProps {
  tournamentId: string;
  tournament: Tournament;
}

export function BuybackButton({ tournamentId, tournament }: BuybackButtonProps) {
  const queryClient = useQueryClient();

  const buyback = useMutation({
    mutationFn: () => apiPost<Buyback>(`/tournaments/${tournamentId}/buyback`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament-participant', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['matchmaking-status'] });
    },
  });

  const price = (tournament.buybackPriceCents / 100).toFixed(2);

  return (
    <Button
      onClick={() => buyback.mutate()}
      disabled={buyback.isPending}
      className="gap-2"
      variant="outline"
    >
      <Heart className="h-4 w-4 text-red-400" />
      {buyback.isPending ? 'Processing…' : `Buy back a life — $${price}`}
    </Button>
  );
}
