import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { QueueStatus } from '@vr-tournament/shared';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { CricketBallLoader } from '@/components/ui/cricket-loader';
import { useSocketEvent } from '@/hooks/useSocket';
import { MatchFoundModal } from '@/components/match/MatchFoundModal';
import { Users, Clock, Target } from 'lucide-react';
import { motion } from 'motion/react';

export function MatchmakingPage() {
  const queryClient = useQueryClient();
  const [matchModal, setMatchModal] = useState<Parameters<typeof MatchFoundModal>[0]['match'] | null>(null);

  const { data: status, isLoading } = useQuery({
    queryKey: ['matchmaking-status'],
    queryFn: () => apiGet<QueueStatus>('/matchmaking/status'),
    refetchInterval: (query) => (query.state.data?.inQueue ? 3000 : false),
  });

  useSocketEvent('queue:joined', () => {
    queryClient.invalidateQueries({ queryKey: ['matchmaking-status'] });
  });
  useSocketEvent('queue:position', () => {
    queryClient.invalidateQueries({ queryKey: ['matchmaking-status'] });
  });
  useSocketEvent('match:found', (data) => {
    setMatchModal(data);
    queryClient.invalidateQueries({ queryKey: ['matchmaking-status'] });
    queryClient.invalidateQueries({ queryKey: ['matches'] });
  });

  const joinMutation = useMutation({
    mutationFn: () => apiPost<QueueStatus>('/matchmaking/queue', {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['matchmaking-status'] }),
  });
  const leaveMutation = useMutation({
    mutationFn: () => apiDelete<QueueStatus>('/matchmaking/queue'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['matchmaking-status'] }),
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/25">
            <Target className="h-4 w-4 text-[var(--color-primary)]" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight">Matchmaking Queue</h1>
        </div>
        <p className="text-[var(--color-muted-foreground)] mt-1 ml-11">
          Join the queue and get paired with an opponent at your skill tier.
          Your first Super Over starts as soon as the match is confirmed.
        </p>
      </motion.div>

      {/* Two-column layout on desktop */}
      <div className="grid lg:grid-cols-[1fr_260px] gap-5 items-start">

        {/* ── Left: queue card ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.07 }}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden"
        >
          <div className="h-1.5 bg-gradient-to-r from-[var(--color-primary)] via-emerald-500 to-[var(--color-primary)]" />

          <div className="p-6 space-y-6">
            <div>
              <h2 className="font-semibold text-lg">Queue Status</h2>
              <p className="text-sm text-[var(--color-muted-foreground)] mt-0.5">
                Skill-tier pairing · First in queue meets next available opponent
              </p>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-8">
                <CricketBallLoader size="lg" label="Checking queue…" />
              </div>
            ) : status?.inQueue ? (
              <div className="space-y-5">
                <div className="flex flex-col items-center gap-4 py-6 rounded-lg bg-[var(--color-primary)]/5 border border-[var(--color-primary)]/20">
                  <CricketBallLoader size="lg" />
                  <div className="text-center">
                    <p className="font-semibold text-lg">Searching for opponent…</p>
                    <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
                      Hold your crease — we're finding your match
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/20 p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 text-[var(--color-muted-foreground)] text-xs mb-1">
                      <Users className="h-3.5 w-3.5" />
                      Queue position
                    </div>
                    <p className="text-2xl font-bold text-[var(--color-primary)]">#{status.position}</p>
                    <p className="text-xs text-[var(--color-muted-foreground)]">of {status.queueSize} players</p>
                  </div>
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/20 p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 text-[var(--color-muted-foreground)] text-xs mb-1">
                      <Clock className="h-3.5 w-3.5" />
                      Wait time
                    </div>
                    <p className="text-2xl font-bold">{status.waitSeconds}s</p>
                    <p className="text-xs text-[var(--color-muted-foreground)]">and counting</p>
                  </div>
                </div>

                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => leaveMutation.mutate()}
                  disabled={leaveMutation.isPending}
                >
                  Leave Queue
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/20 p-4 text-sm text-[var(--color-muted-foreground)] space-y-1.5">
                  <p className="flex items-center gap-2">
                    <Users className="h-4 w-4 shrink-0" />
                    Matched by skill tier — no one-sided games
                  </p>
                  <p className="flex items-center gap-2">
                    <Target className="h-4 w-4 shrink-0" />
                    6-ball Super Over format — pure pressure cricket
                  </p>
                </div>
                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => joinMutation.mutate()}
                  disabled={joinMutation.isPending}
                >
                  {joinMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <CricketBallLoader size="sm" />
                      Joining…
                    </span>
                  ) : 'Join Queue'}
                </Button>
              </div>
            )}
          </div>
        </motion.div>

        {/* ── Right: cricket-action.jpg decorative panel ── */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="hidden lg:block relative rounded-xl overflow-hidden min-h-[340px] bg-[#061a08]"
        >
          {/* Image — heavily darkened + saturated so white bg disappears */}
          <img
            src="/images/cricket-action.jpg"
            alt=""
            aria-hidden
            className="absolute inset-0 w-full h-full object-cover"
            style={{
              filter: 'brightness(0.38) saturate(1.8) contrast(1.2)',
              mixBlendMode: 'luminosity',
            }}
          />

          {/* Colour overlay — brings back the green cricket atmosphere */}
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-950/70 via-emerald-900/40 to-slate-900/60" />

          {/* Top edge vignette */}
          <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[#061a08] to-transparent" />
          {/* Bottom gradient + text */}
          <div className="absolute inset-x-0 bottom-0 pt-24 pb-6 px-5 bg-gradient-to-t from-[#061a08] via-[#061a08]/80 to-transparent">
            <p className="text-3xl font-bold text-white leading-tight">
              6 balls.
            </p>
            <p className="text-3xl font-bold text-emerald-400 leading-tight">
              Everything.
            </p>
            <p className="mt-2 text-xs text-white/50 uppercase tracking-widest">
              Super Over format
            </p>
          </div>

          {/* Flame glow pulse */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at 50% 60%, rgba(255,100,0,0.08) 0%, transparent 70%)' }}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.div>
      </div>

      <p className="text-sm text-center text-[var(--color-muted-foreground)]">
        Or{' '}
        <Link to="/tournaments" className="text-[var(--color-primary)] hover:underline font-medium">
          register for a tournament
        </Link>{' '}
        and join its bracket.
      </p>

      {matchModal && (
        <MatchFoundModal match={matchModal} onClose={() => setMatchModal(null)} />
      )}
    </div>
  );
}
