import { Link } from 'react-router-dom';
import type { TournamentBracket } from '@vr-tournament/shared';
import { Badge, matchStatusBadge } from '@/components/ui/badge';
import { Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';

type BracketMatch = TournamentBracket['rounds'][0]['matches'][0];

interface NormalMatchListProps {
  matches: BracketMatch[];
}

export function NormalMatchList({ matches }: NormalMatchListProps) {
  if (matches.length === 0) {
    return <p className="text-sm text-[var(--color-muted-foreground)] py-4">No matches in this round yet.</p>;
  }

  return (
    <div className="space-y-3">
      {matches.map((m, i) => {
        const badge = m.status ? matchStatusBadge(m.status) : null;
        const p1Won = m.status === 'completed' && m.winnerId === m.player1?.id;
        const p2Won = m.status === 'completed' && m.winnerId === m.player2?.id;

        return (
          <div
            key={m.matchId ?? i}
            className="flex items-center gap-3 text-sm border border-[var(--color-border)] rounded-lg px-4 py-3 bg-[var(--color-card)]"
          >
            <PlayerCell player={m.player1} won={p1Won} align="left" />
            <div className="shrink-0 px-2">
              {badge ? (
                <Badge variant={badge.variant}>{badge.label}</Badge>
              ) : (
                <span className="text-[var(--color-muted-foreground)] text-xs">vs</span>
              )}
            </div>
            <PlayerCell player={m.player2} won={p2Won} align="right" />
          </div>
        );
      })}
    </div>
  );
}

function PlayerCell({
  player,
  won,
  align,
}: {
  player: BracketMatch['player1'];
  won: boolean;
  align: 'left' | 'right';
}) {
  if (!player) {
    return <span className={cn('flex-1 text-[var(--color-muted-foreground)]', align === 'right' && 'text-right')}>TBD</span>;
  }

  return (
    <span
      className={cn(
        'flex-1 flex items-center gap-1.5 truncate font-medium',
        align === 'right' && 'justify-end',
        won && 'text-amber-400'
      )}
    >
      {won && <Trophy className="h-4 w-4 shrink-0 text-amber-400" />}
      <Link to={`/players/${player.username}`} className="hover:underline truncate">
        {player.username}
      </Link>
    </span>
  );
}
