import { useQueryClient } from '@tanstack/react-query';
import type { BuybackOption } from '@vr-tournament/shared';
import { LIVE_QUERY_KEYS } from '@/lib/query-keys';
import { BuybackButton } from './BuybackButton';
import { Heart } from 'lucide-react';

interface BuybackBannerProps {
  option: BuybackOption;
}

export function BuybackBanner({ option }: BuybackBannerProps) {
  const queryClient = useQueryClient();
  const tournament = {
    id: option.tournamentId,
    name: option.tournamentName,
    buybackPriceCents: option.buybackPriceCents,
  } as Parameters<typeof BuybackButton>[0]['tournament'];

  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/15">
          <Heart className="h-4 w-4 text-red-400" />
        </span>
        <div>
          <p className="font-semibold text-[var(--color-foreground)]">You&apos;re out — buy back a life</p>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-0.5">
            You were eliminated from <span className="font-medium">{option.tournamentName}</span>.
            Buy back to rejoin the queue for round {option.roundNumber}.
          </p>
        </div>
      </div>
      <BuybackButton
        tournamentId={option.tournamentId}
        tournament={tournament}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: LIVE_QUERY_KEYS.buybackOptions });
          queryClient.invalidateQueries({ queryKey: LIVE_QUERY_KEYS.matches });
        }}
      />
    </div>
  );
}
