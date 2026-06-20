import type { BuybackOption, Match, MatchResult } from '@vr-tournament/shared';
import { BuybackButton } from './BuybackButton';

interface MatchBuybackPromptProps {
  match: Match;
  userId: string;
  buybackOptions: BuybackOption[];
}

export function MatchBuybackPrompt({ match, userId, buybackOptions }: MatchBuybackPromptProps) {
  const result = match.result as MatchResult | null;
  const isLoss =
    match.status === 'completed' &&
    !!result?.winnerId &&
    result.winnerId !== userId &&
    !!match.tournamentId;

  const option = buybackOptions.find((o) => o.tournamentId === match.tournamentId);
  if (!isLoss || !option) return null;

  const tournament = {
    id: option.tournamentId,
    name: option.tournamentName,
    buybackPriceCents: option.buybackPriceCents,
  } as Parameters<typeof BuybackButton>[0]['tournament'];

  return (
    <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
      <BuybackButton tournamentId={option.tournamentId} tournament={tournament} matchId={match.id} />
    </div>
  );
}
