import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Share2, Volume2, VolumeX } from 'lucide-react';
import { commentaryFor, oversLabel, type LiveBall, type LiveBallEvent, type LiveInnings, type LiveMatchView } from '@vr-tournament/shared';
import { apiGet } from '@/lib/api';
import { useLiveWatch } from '@/hooks/useLiveWatch';
import { isLiveSoundOn, playLiveSound, setLiveSoundOn } from '@/lib/live-sound';
import { LiveCelebration, RunsPop, type Burst, type RunsPopState } from '@/components/live/LiveCelebration';
import { BackButton } from '@/components/ui/back-button';
import { Button } from '@/components/ui/button';
import { QueryError } from '@/components/ui/query-error';
import { cn } from '@/lib/utils';

/** Public live scorecard for one match: ball by ball, with celebrations. */
export function LiveMatchPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const key = ['live-match', id];
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: key,
    queryFn: () => apiGet<LiveMatchView>(`/live/matches/${id}`),
    refetchInterval: 30_000,
  });

  const [burst, setBurst] = useState<Burst | null>(null);
  const [pop, setPop] = useState<RunsPopState | null>(null);
  const [shake, setShake] = useState(0);
  const [sound, setSound] = useState(isLiveSoundOn);
  const counter = useRef(0);

  // Celebrations clear themselves.
  useEffect(() => {
    if (!burst) return;
    const t = setTimeout(() => setBurst(null), 1600);
    return () => clearTimeout(t);
  }, [burst]);
  useEffect(() => {
    if (!pop) return;
    const t = setTimeout(() => setPop(null), 900);
    return () => clearTimeout(t);
  }, [pop]);

  const celebrate = (e: LiveBallEvent) => {
    const n = ++counter.current;
    if (e.ball.wicket) {
      setBurst({ id: n, kind: 'wicket' });
      setShake(n);
      playLiveSound('wicket');
    } else if (e.ball.runs === 6) {
      setBurst({ id: n, kind: 'six' });
      playLiveSound('six');
    } else if (e.ball.runs === 4) {
      setBurst({ id: n, kind: 'four' });
      playLiveSound('four');
    } else if (e.ball.runs > 0) {
      setPop({ id: n, runs: e.ball.runs });
      playLiveSound('runs');
    }
  };

  useLiveWatch('match', id, {
    onBall: (e) => {
      if (e.matchId !== id) return;
      celebrate(e);
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onInnings: () => void queryClient.invalidateQueries({ queryKey: key }),
  });

  const toggleSound = () => {
    setLiveSoundOn(!sound);
    setSound(!sound);
  };
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: data?.headline ?? 'Live match', url });
      else await navigator.clipboard.writeText(url);
    } catch {
      /* share sheet closed */
    }
  };

  if (isLoading) return <p className="py-16 text-center text-sm text-[var(--color-muted-foreground)]">Loading the live score…</p>;
  if (error || !data) return <QueryError error={error} resource="match" onRetry={() => refetch()} />;

  const batting = data.innings.find((s) => s.state === 'batting') ?? [...data.innings].reverse().find((s) => s.balls.length > 0);
  const feed = data.innings.flatMap((s) => s.balls.map((b) => ({ b, who: s.username }))).sort((a, b) => b.b.at.localeCompare(a.b.at));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackButton to={data.tournamentId ? `/tournaments/${data.tournamentId}` : '/tournaments'} label="Back to tournament" />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={toggleSound} tooltip={sound ? 'Turn match sounds off' : 'Turn match sounds on'} aria-pressed={sound}>
            {sound ? <Volume2 className="h-4 w-4" aria-hidden /> : <VolumeX className="h-4 w-4" aria-hidden />}
            {sound ? 'Sound on' : 'Sound off'}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={share} tooltip="Share this live match">
            <Share2 className="h-4 w-4" aria-hidden /> Share
          </Button>
        </div>
      </div>

      <header className="space-y-1">
        <p className="text-sm text-[var(--color-muted-foreground)]">
          {[data.tournamentName, data.roundLabel, oversLabel(data.overs)].filter(Boolean).join(' · ')}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill status={data.status} />
          <h1 className="text-2xl font-extrabold sm:text-3xl" aria-live="polite">{data.headline}</h1>
        </div>
      </header>

      <motion.section
        key={shake}
        animate={shake ? { x: [0, -12, 12, -8, 8, -4, 0] } : undefined}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-card)] via-[var(--color-card)] to-[var(--color-primary)]/10 p-5 sm:p-6"
        aria-label="Scoreboard"
      >
        <div className="space-y-4">
          {data.innings.map((s) => (
            <InningsRow key={s.userId} s={s} ballsPerInnings={data.ballsPerInnings} won={data.winnerId === s.userId} pop={s.state === 'batting' ? pop : null} />
          ))}
        </div>
        {data.needed && (
          <p className="mt-5 rounded-xl border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 px-4 py-3 text-center font-semibold">
            Needs <span className="text-[var(--color-primary)]">{data.needed.runs}</span> off {data.needed.balls} ball{data.needed.balls === 1 ? '' : 's'}
            {data.needed.balls > 0 && (
              <span className="ml-2 text-sm font-normal text-[var(--color-muted-foreground)]">
                · required rate {((data.needed.runs / data.needed.balls) * 6).toFixed(1)}
              </span>
            )}
          </p>
        )}
        <LiveCelebration burst={burst} />
      </motion.section>

      {batting && batting.balls.length > 0 && <ThisOver balls={batting.balls} />}

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
        <h2 className="mb-3 text-sm font-semibold">Ball by ball</h2>
        {feed.length === 0 ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {data.status === 'upcoming' ? 'The first ball will appear here the moment it is bowled.' : 'Ball-by-ball updates were not sent for this match.'}
          </p>
        ) : (
          <ol className="space-y-1.5">
            <AnimatePresence initial={false}>
              {feed.slice(0, 60).map(({ b, who }) => (
                <motion.li
                  key={`${who}-${b.seq}`}
                  layout
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm',
                    b.wicket ? 'bg-red-500/10' : b.runs === 6 ? 'bg-fuchsia-500/10' : b.runs === 4 ? 'bg-sky-500/10' : ''
                  )}
                >
                  <BallChip b={b} />
                  <span>{commentaryFor(b, who)}</span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        )}
      </section>
    </div>
  );
}

function StatusPill({ status }: { status: LiveMatchView['status'] }) {
  if (status === 'live')
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-red-400">
        <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" aria-hidden /> Live
      </span>
    );
  return (
    <span className="rounded-full border border-[var(--color-border)] px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
      {status === 'finished' ? 'Result' : 'Starting soon'}
    </span>
  );
}

function InningsRow({ s, ballsPerInnings, won, pop }: { s: LiveInnings; ballsPerInnings: number; won: boolean; pop: RunsPopState | null }) {
  const pct = Math.min(100, Math.round((s.legalBalls / Math.max(1, ballsPerInnings)) * 100));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className={cn('truncate text-lg font-semibold', won && 'text-amber-300')}>
            {won && '🏆 '}
            {s.username}
          </p>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            {s.state === 'batting' ? (
              <span className="font-semibold text-red-400">● Batting now</span>
            ) : s.state === 'done' ? (
              'Innings complete'
            ) : (
              'Yet to bat'
            )}
            {s.target != null && ` · target ${s.target}`}
          </p>
        </div>
        <div className="relative text-right">
          <RunsPop pop={pop} />
          <p className="text-4xl font-black tabular-nums sm:text-5xl">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={`${s.runs}-${s.wickets}`} initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -18, opacity: 0 }} className="inline-block">
                {s.state === 'waiting' ? '—' : `${s.runs}/${s.wickets}`}
              </motion.span>
            </AnimatePresence>
          </p>
          <p className="text-xs tabular-nums text-[var(--color-muted-foreground)]">
            {s.overs} / {ballsPerInnings / 6} ov
          </p>
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--color-muted)]" aria-hidden>
        <div className="h-1.5 rounded-full bg-[var(--color-primary)] transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ThisOver({ balls }: { balls: LiveBall[] }) {
  const last = balls[balls.length - 1].seq;
  const overStart = Math.floor((last - 1) / 6) * 6;
  const over = balls.filter((b) => b.seq > overStart);
  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5" aria-label="This over">
      <h2 className="mb-3 text-sm font-semibold">This over · over {overStart / 6 + 1}</h2>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }, (_, i) => {
          const b = over.find((x) => x.seq === overStart + i + 1);
          return b ? (
            <motion.span key={b.seq} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 20 }}>
              <BallChip b={b} big />
            </motion.span>
          ) : (
            <span key={`empty-${i}`} className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-[var(--color-border)]" aria-hidden />
          );
        })}
      </div>
    </section>
  );
}

function BallChip({ b, big }: { b: LiveBall; big?: boolean }) {
  const label = b.wicket ? 'W' : b.runs === 0 ? '•' : String(b.runs);
  return (
    <span
      title={`Ball ${b.label}`}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-bold tabular-nums',
        big ? 'h-11 w-11 text-base' : 'h-7 w-7 text-xs',
        b.wicket
          ? 'bg-red-500 text-white'
          : b.runs === 6
            ? 'bg-gradient-to-br from-amber-400 to-fuchsia-500 text-white'
            : b.runs === 4
              ? 'bg-gradient-to-br from-sky-400 to-emerald-500 text-white'
              : b.runs === 0
                ? 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]'
                : 'border border-[var(--color-border)] bg-[var(--color-background)]'
      )}
    >
      {label}
    </span>
  );
}
