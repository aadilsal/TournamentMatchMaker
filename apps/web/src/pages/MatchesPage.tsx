import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Match, MatchResult, User, BuybackOption } from '@vr-tournament/shared';
import { apiGet, apiPost } from '@/lib/api';
import { getUserErrorMessage } from '@/lib/user-messages';
import {
  LIVE_QUERY_KEYS,
  LIVE_STALE_TIME,
  SAFETY_POLL_MS,
  matchesNeedPolling,
} from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import { Badge, matchStatusBadge } from '@/components/ui/badge';
import { ListSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { MatchBuybackPrompt } from '@/components/tournament/MatchBuybackPrompt';
import { BuybackBanner } from '@/components/tournament/BuybackBanner';
import { useState } from 'react';
import { MapPin, Trophy, Swords } from 'lucide-react';
import { motion } from 'motion/react';

export function MatchesPage() {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<Record<string, string>>({});

  const { data: me } = useQuery({
    queryKey: ['profile'],
    queryFn: () => apiGet<User>('/players/me'),
  });

  const { data: matches = [], isLoading } = useQuery({
    queryKey: LIVE_QUERY_KEYS.matches,
    queryFn: () => apiGet<Match[]>('/matches/me'),
    staleTime: LIVE_STALE_TIME,
    refetchInterval: (q) =>
      matchesNeedPolling(q.state.data) ? SAFETY_POLL_MS : false,
  });

  const { data: buybackOptions = [] } = useQuery({
    queryKey: LIVE_QUERY_KEYS.buybackOptions,
    queryFn: () => apiGet<BuybackOption[]>('/players/me/buyback-options'),
    staleTime: LIVE_STALE_TIME,
    refetchInterval: matchesNeedPolling(matches) ? SAFETY_POLL_MS : false,
  });

  const confirmMutation = useMutation({
    mutationFn: (matchId: string) => apiPost<Match>(`/matches/${matchId}/confirm`),
    onMutate: async (matchId) => {
      setActionError((prev) => ({ ...prev, [matchId]: '' }));
      if (!me) return {};
      await queryClient.cancelQueries({ queryKey: LIVE_QUERY_KEYS.matches });
      const previous = queryClient.getQueryData<Match[]>(LIVE_QUERY_KEYS.matches);
      queryClient.setQueryData<Match[]>(LIVE_QUERY_KEYS.matches, (old) =>
        old?.map((m) => {
          if (m.id !== matchId) return m;
          const isP1 = me.id === m.player1Id;
          return {
            ...m,
            confirmations: {
              player1Confirmed: isP1 ? true : (m.confirmations?.player1Confirmed ?? false),
              player2Confirmed: !isP1 ? true : (m.confirmations?.player2Confirmed ?? false),
            },
          };
        })
      );
      return { previous };
    },
    onError: (err, matchId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(LIVE_QUERY_KEYS.matches, context.previous);
      }
      setActionError((prev) => ({ ...prev, [matchId]: getUserErrorMessage(err) }));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: LIVE_QUERY_KEYS.matches });
    },
  });

  const declineMutation = useMutation({
    mutationFn: (matchId: string) => apiPost<Match>(`/matches/${matchId}/decline`, { requeue: true }),
    onMutate: (matchId) => {
      setActionError((prev) => ({ ...prev, [matchId]: '' }));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIVE_QUERY_KEYS.matches }),
    onError: (err, matchId) => {
      setActionError((prev) => ({ ...prev, [matchId]: getUserErrorMessage(err) }));
    },
  });

  const active = matches.filter((m) =>
    ['pending_confirmation', 'confirmed', 'in_progress'].includes(m.status)
  );
  const history = matches.filter((m) =>
    ['completed', 'cancelled', 'expired'].includes(m.status)
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/25">
            <Trophy className="h-4.5 w-4.5 text-[var(--color-primary)]" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight">My Matches</h1>
        </div>
        <p className="text-[var(--color-muted-foreground)] mt-1 ml-11">
          Track live matches — scores sync from your Meta Quest headset
        </p>
      </motion.div>

      {buybackOptions.length > 0 && (
        <div className="space-y-3">
          {buybackOptions.map((option) => (
            <BuybackBanner key={option.tournamentId} option={option} />
          ))}
        </div>
      )}

      {isLoading ? (
        <ListSkeleton count={3} />
      ) : active.length === 0 && history.length === 0 ? (
        <EmptyState
          icon={<Swords className="h-12 w-12" />}
          title="No active matches"
          description="Enter a tournament and we'll find your opponent automatically."
          action={{ label: 'Browse tournaments', href: '/tournaments' }}
        />
      ) : (
        <>
          {active.length > 0 && (
            <div className="space-y-4">
              {active.map((match, i) => {
                const { label, variant } = matchStatusBadge(match.status);
                const isP1 = me && match.player1Id === me.id;
                const result = match.result as MatchResult | null;
                const myScore = isP1 ? result?.player1Score : result?.player2Score;
                const opponentScore = isP1 ? result?.player2Score : result?.player1Score;
                const awaitingScores =
                  (match.status === 'confirmed' || match.status === 'in_progress') &&
                  (myScore == null || opponentScore == null);
                const chaseTarget = match.result?.chaseTarget;
                const amChasing = chaseTarget != null && match.result?.chasePlayerId === me?.id;
                const youConfirmed =
                  !!me &&
                  !!match.confirmations &&
                  (me.id === match.player1Id
                    ? match.confirmations.player1Confirmed
                    : me.id === match.player2Id
                      ? match.confirmations.player2Confirmed
                      : false);
                const opponentConfirmed =
                  !!me &&
                  !!match.confirmations &&
                  (me.id === match.player1Id
                    ? match.confirmations.player2Confirmed
                    : me.id === match.player2Id
                      ? match.confirmations.player1Confirmed
                      : false);
                const isConfirming =
                  confirmMutation.isPending && confirmMutation.variables === match.id;
                const isDeclining =
                  declineMutation.isPending && declineMutation.variables === match.id;

                return (
                  <motion.div
                    key={match.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: i * 0.06 }}
                    className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden"
                  >
                    {/* VS header */}
                    <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Link to={`/players/${match.player1?.username}`} className="font-semibold truncate hover:underline">
                          {match.player1?.username ?? '—'}
                        </Link>
                        <span className="flex items-center justify-center h-6 w-6 rounded-full bg-[var(--color-primary)]/15 shrink-0">
                          <Swords className="h-3 w-3 text-[var(--color-primary)]" />
                        </span>
                        <Link to={`/players/${match.player2?.username}`} className="font-semibold truncate hover:underline">
                          {match.player2?.username ?? '—'}
                        </Link>
                      </div>
                      <Badge variant={variant}>{label}</Badge>
                    </div>

                    <div className="px-5 py-4 space-y-3">
                      {match.venue && (
                        <p className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)]">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          {match.venue.name}, {match.venue.city}
                        </p>
                      )}
                      {match.slot && (
                        <p className="text-sm text-[var(--color-muted-foreground)]">
                          {new Date(match.slot.startTime).toLocaleString()}
                        </p>
                      )}

                      {match.status === 'pending_confirmation' && (
                        <div className="space-y-2 pt-1">
                          {youConfirmed && !opponentConfirmed && (
                            <p className="text-sm text-[var(--color-primary)]">
                              You confirmed — waiting for your opponent to confirm.
                            </p>
                          )}
                          {!youConfirmed && opponentConfirmed && (
                            <p className="text-sm text-[var(--color-muted-foreground)]">
                              Your opponent confirmed. Please confirm to lock in the match.
                            </p>
                          )}
                          {actionError[match.id] && (
                            <p className="text-sm text-[var(--color-destructive)]">
                              {actionError[match.id]}
                            </p>
                          )}
                          <div className="flex gap-2">
                            {!youConfirmed && (
                              <Button
                                size="sm"
                                onClick={() => confirmMutation.mutate(match.id)}
                                disabled={isConfirming || isDeclining}
                              >
                                {isConfirming ? 'Confirming…' : 'Confirm match'}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => declineMutation.mutate(match.id)}
                              disabled={isConfirming || isDeclining}
                            >
                              {isDeclining ? 'Declining…' : 'Decline'}
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Score state for confirmed / in_progress */}
                      {(match.status === 'confirmed' || match.status === 'in_progress') && me && (
                        <div className="pt-1 space-y-2">
                          {chaseTarget != null && (
                            <p className="text-sm text-[var(--color-primary)]">
                              {amChasing
                                ? `Beat ${chaseTarget} runs to win`
                                : `Your target on the line: ${chaseTarget} runs`}
                            </p>
                          )}
                          {awaitingScores && (
                            <p className="text-sm text-[var(--color-muted-foreground)]">
                              Play in your Meta Quest headset — your score will appear here automatically.
                            </p>
                          )}
                          {myScore != null && (
                            <p className="text-sm text-[var(--color-muted-foreground)]">
                              Your score: <span className="font-semibold text-[var(--color-foreground)]">{myScore} runs</span>
                              {opponentScore != null
                                ? <> · Opponent: <span className="font-semibold text-[var(--color-foreground)]">{opponentScore} runs</span></>
                                : " · Awaiting opponent's score…"}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}

          {history.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider">
                Match history
              </h2>
              {history.map((match, i) => {
                const { label, variant } = matchStatusBadge(match.status);
                const result = match.result as MatchResult | null;
                const isWinner = me && result?.winnerId === me.id;
                const isTie = match.status === 'completed' && result && result.winnerId === null;

                return (
                  <motion.div
                    key={match.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: i * 0.04 }}
                    className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]/60 px-5 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium truncate">{match.player1?.username ?? '—'}</span>
                        <span className="text-xs text-[var(--color-muted-foreground)]">vs</span>
                        <span className="text-sm font-medium truncate">{match.player2?.username ?? '—'}</span>
                      </div>
                      <Badge variant={variant}>{label}</Badge>
                    </div>

                    {result && (result.player1Score != null || result.player2Score != null) && (
                      <p className="mt-1.5 text-xs text-[var(--color-muted-foreground)]">
                        {match.player1?.username}: {result.player1Score ?? '—'} runs
                        {' · '}
                        {match.player2?.username}: {result.player2Score ?? '—'} runs
                        {isTie && ' · Tie'}
                        {isWinner && (
                          <span className="ml-1 font-semibold text-[var(--color-primary)]">· You won</span>
                        )}
                        {me && !isTie && result.winnerId && result.winnerId !== me.id && (
                          <span className="ml-1 text-red-400">· You lost</span>
                        )}
                      </p>
                    )}
                    {me && <MatchBuybackPrompt match={match} userId={me.id} buybackOptions={buybackOptions} />}
                  </motion.div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
