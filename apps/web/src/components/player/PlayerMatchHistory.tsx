import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { Match } from '@vr-tournament/shared';
import { knockoutRoundLabel } from '@vr-tournament/shared';
import { apiGet } from '@/lib/api';
import { Badge, matchStatusBadge } from '@/components/ui/badge';
import { ListSkeleton } from '@/components/ui/skeleton';
import { Swords, Trophy } from 'lucide-react';

function roundLabel(match: Match) {
  if (match.roundNumber == null) return null;
  return match.phase === 'knockout'
    ? knockoutRoundLabel(match.roundNumber)
    : `Round ${match.roundNumber}`;
}

export function PlayerMatchHistory({
  username,
  playerId,
}: {
  username: string;
  playerId: string;
}) {
  const { data: matches = [], isLoading } = useQuery({
    queryKey: ['public-matches', username],
    queryFn: () => apiGet<Match[]>(`/players/${username}/matches`),
    enabled: !!username,
  });

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Swords className="h-5 w-5 text-[var(--color-primary)]" />
        Match history
      </h2>
      {isLoading ? (
        <ListSkeleton count={3} />
      ) : matches.length === 0 ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">No matches played yet.</p>
      ) : (
        <div className="space-y-2">
          {matches.map((m) => {
            const isP1 = m.player1Id === playerId;
            const opponent = isP1 ? m.player2 : m.player1;
            const won = m.result?.winnerId === playerId;
            const badge = matchStatusBadge(m.status);
            const round = roundLabel(m);
            const playedAt = m.scheduledAt ?? m.createdAt;
            return (
              <div
                key={m.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-[var(--color-border)] px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {won && m.status === 'completed' && (
                      <Trophy className="h-4 w-4 text-[var(--color-primary)] shrink-0" />
                    )}
                    <span>
                      vs{' '}
                      <Link
                        to={`/players/${opponent?.username}`}
                        className="font-medium hover:underline"
                      >
                        {opponent?.username ?? '—'}
                      </Link>
                    </span>
                    {m.result && (
                      <span className="text-[var(--color-muted-foreground)]">
                        ({m.result.player1Score}–{m.result.player2Score})
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--color-muted-foreground)]">
                    {m.tournament && (
                      <Link
                        to={`/tournaments/${m.tournament.id}`}
                        className="hover:underline"
                      >
                        {m.tournament.name}
                      </Link>
                    )}
                    {round && (
                      <>
                        {m.tournament && <span aria-hidden>·</span>}
                        <span>{round}</span>
                      </>
                    )}
                    {(m.tournament || round) && <span aria-hidden>·</span>}
                    <span>{new Date(playedAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <Badge variant={badge.variant}>{badge.label}</Badge>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
