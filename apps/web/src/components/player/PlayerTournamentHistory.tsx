import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { PlayerTournamentSummary } from '@vr-tournament/shared';
import { knockoutRoundLabel } from '@vr-tournament/shared';
import { apiGet } from '@/lib/api';
import {
  Badge,
  participantStatusBadge,
  tournamentStatusBadge,
} from '@/components/ui/badge';
import { ListSkeleton } from '@/components/ui/skeleton';
import { Trophy } from 'lucide-react';

function reachedLabel(entry: PlayerTournamentSummary) {
  if (entry.roundReached == null) return null;
  return entry.participantStatus === 'knockout' || entry.phase === 'knockout'
    ? `Reached ${knockoutRoundLabel(entry.roundReached)}`
    : `Reached round ${entry.roundReached}`;
}

export function PlayerTournamentHistory({ username }: { username: string }) {
  const { data: tournaments = [], isLoading } = useQuery({
    queryKey: ['public-tournaments', username],
    queryFn: () => apiGet<PlayerTournamentSummary[]>(`/players/${username}/tournaments`),
    enabled: !!username,
  });

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Trophy className="h-5 w-5 text-[var(--color-primary)]" />
        Tournaments
      </h2>
      {isLoading ? (
        <ListSkeleton count={3} />
      ) : tournaments.length === 0 ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Not entered in any tournament yet.
        </p>
      ) : (
        <div className="space-y-2">
          {tournaments.map((t) => {
            const status = tournamentStatusBadge(t.status);
            const participant = t.participantStatus
              ? participantStatusBadge(t.participantStatus)
              : null;
            const reached = reachedLabel(t);
            return (
              <div
                key={t.tournamentId}
                className="flex items-start justify-between gap-3 rounded-lg border border-[var(--color-border)] px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <Link
                    to={`/tournaments/${t.tournamentId}`}
                    className="font-medium hover:underline"
                  >
                    {t.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--color-muted-foreground)]">
                    <span>{t.game}</span>
                    <span aria-hidden>·</span>
                    <span>
                      {new Date(t.startDate).toLocaleDateString()} –{' '}
                      {new Date(t.endDate).toLocaleDateString()}
                    </span>
                    {reached && (
                      <>
                        <span aria-hidden>·</span>
                        <span>{reached}</span>
                      </>
                    )}
                    {t.matchesPlayed > 0 && (
                      <>
                        <span aria-hidden>·</span>
                        <span>
                          {t.wins}W–{t.losses}L in {t.matchesPlayed}{' '}
                          {t.matchesPlayed === 1 ? 'match' : 'matches'}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge variant={status.variant}>{status.label}</Badge>
                  {participant && (
                    <Badge variant={participant.variant}>{participant.label}</Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
