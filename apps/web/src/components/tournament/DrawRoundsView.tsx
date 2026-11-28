import { useQuery } from '@tanstack/react-query';
import type { Match, TournamentRound } from '@vr-tournament/shared';
import { apiGet } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { LiveMatch } from '@vr-tournament/shared';
import { Link } from 'react-router-dom';
import { liveScoreText, useTournamentLive } from '@/hooks/useLiveScores';

/** An unfinished match: batting now with its live score, a chase on, or still to play. */
function OpenMatchState({ live, matchId }: { live?: LiveMatch; matchId: string }) {
  if (live?.state === 'batting') {
    const score = liveScoreText(live);
    return (
      <Link to={`/matches/${matchId}/live`} title="Watch this innings ball by ball" className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-400 hover:bg-red-500/20">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" aria-hidden />
        {score ?? 'Batting now'}
      </Link>
    );
  }
  if (live?.state === 'chasing' && live.target != null) return <Badge variant="info">Chase {live.target}</Badge>;
  return <Badge variant="info">To play</Badge>;
}

/** Draw-format results: each round's matches, newest round first. */
export function DrawRoundsView({ tournamentId }: { tournamentId: string }) {
  const rounds = useQuery({
    queryKey: ['tournament', tournamentId, 'rounds'],
    queryFn: () => apiGet<TournamentRound[]>(`/tournaments/${tournamentId}/rounds`),
  });
  const matches = useQuery({
    queryKey: ['tournament', tournamentId, 'matches'],
    queryFn: () => apiGet<Match[]>(`/tournaments/${tournamentId}/matches`),
    refetchInterval: 30_000,
  });

  // Live state of the current round's matches; also refreshes this list on every ball.
  const live = useTournamentLive(tournamentId, (rounds.data ?? []).some((r) => r.status === 'active'));
  const list = [...(rounds.data ?? [])].sort((a, b) => b.roundNumber - a.roundNumber);
  if (list.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rounds</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {list.map((round) => {
          const inRound = (matches.data ?? []).filter((m) => m.roundNumber === round.roundNumber);
          const label = (inRound[0]?.result as { roundLabel?: string } | null)?.roundLabel ?? `Round ${round.roundNumber}`;
          return (
            <section key={round.id} aria-label={label}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="font-semibold">{label}</h3>
                <span className="text-xs text-[var(--color-muted-foreground)]">
                  {round.status === 'active' ? `Closes ${formatDateTime(round.endsAt)}` : 'Finished'}
                </span>
              </div>
              <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
                {inRound.map((m) => {
                  const r = (m.result ?? {}) as { player1Score?: number | null; player2Score?: number | null; winnerId?: string | null };
                  const name1 = m.player1?.username ?? 'Player';
                  const name2 = m.player2?.username ?? 'Player';
                  const s = (n?: number | null) => (n == null ? '–' : String(n));
                  return (
                    <li key={m.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="min-w-0 truncate">
                        <span className={r.winnerId === m.player1Id ? 'font-semibold' : ''}>{name1}</span>
                        <span className="text-[var(--color-muted-foreground)]"> vs </span>
                        <span className={r.winnerId === m.player2Id ? 'font-semibold' : ''}>{name2}</span>
                      </span>
                      {m.status === 'completed' ? (
                        <span className="shrink-0 tabular-nums">
                          {s(r.player1Score ?? live.byMatch.get(m.id)?.player1.score)} – {s(r.player2Score ?? live.byMatch.get(m.id)?.player2.score)}
                        </span>
                      ) : m.status === 'expired' ? (
                        <Badge variant="neutral">Not played</Badge>
                      ) : (
                        <OpenMatchState live={live.byMatch.get(m.id)} matchId={m.id} />
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}
