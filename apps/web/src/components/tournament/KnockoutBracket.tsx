import { Link } from 'react-router-dom';
import type { TournamentBracket } from '@vr-tournament/shared';
import { Trophy } from 'lucide-react';

interface KnockoutBracketProps {
  rounds: TournamentBracket['rounds'];
}

const KO_ORDER = ['Round of 16', 'Quarter-finals', 'Semi-finals', 'Final'];

export function KnockoutBracket({ rounds }: KnockoutBracketProps) {
  const koRounds = rounds
    .filter((r) => r.phase === 'knockout' || (r.label && KO_ORDER.some((l) => r.label?.includes(l.split('-')[0] ?? ''))))
    .sort((a, b) => a.round - b.round);

  if (koRounds.length === 0) {
    return (
      <p className="text-sm text-[var(--color-muted-foreground)] py-4">
        Knockout bracket starts when 16 players qualify.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-8 min-w-max">
        {koRounds.map((round) => (
          <div key={round.round} className="flex flex-col gap-4 min-w-[200px]">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)] text-center">
              {round.label ?? `Round ${round.round}`}
            </h3>
            <div className="flex flex-col gap-6 justify-around flex-1">
              {round.matches.map((m, i) => {
                const p1Won = m.winnerId === m.player1?.id;
                const p2Won = m.winnerId === m.player2?.id;
                return (
                  <div
                    key={m.matchId ?? i}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden text-sm"
                  >
                    <MatchNode player={m.player1} won={p1Won} />
                    <div className="border-t border-[var(--color-border)]" />
                    <MatchNode player={m.player2} won={p2Won} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MatchNode({
  player,
  won,
}: {
  player: { id: string; username: string } | null;
  won: boolean;
}) {
  return (
    <div
      className={`px-3 py-2 flex items-center gap-2 ${won ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]' : ''}`}
    >
      {won && <Trophy className="h-3.5 w-3.5 shrink-0" />}
      {player ? (
        <Link to={`/players/${player.username}`} className="truncate hover:underline font-medium">
          {player.username}
        </Link>
      ) : (
        <span className="text-[var(--color-muted-foreground)]">TBD</span>
      )}
    </div>
  );
}
