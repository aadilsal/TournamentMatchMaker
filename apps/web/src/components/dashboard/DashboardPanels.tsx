import { Link } from 'react-router-dom';
import type { PlayerCardTournament, PlayerDashboard } from '@vr-tournament/shared';
import { TIER_THRESHOLDS, oversLabel, pointsToTier, timeLeft } from '@vr-tournament/shared';
import { ArrowRight, Flame, Radio, Shield, Swords, Target, Trophy, TrendingUp } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

/** The one thing to do now: the first match where it is this player's turn. */
export function NextUp({ tournaments }: { tournaments: PlayerCardTournament[] }) {
  const t = tournaments.find((x) => x.match?.state === 'your_turn');
  if (!t?.match) return null;
  const m = t.match;
  const chasing = m.opponentScore >= 0;
  return (
    <section
      aria-label="Next up"
      className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--color-primary)]/40 bg-gradient-to-r from-[var(--color-primary)]/20 to-[var(--color-card)] p-5"
    >
      <div className="flex items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-white">
          {chasing ? <Target className="h-6 w-6" aria-hidden /> : <Swords className="h-6 w-6" aria-hidden />}
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">Your turn · {t.name}</p>
          <p className="text-xl font-extrabold">
            {chasing ? `Chase ${m.opponentScore + 1} to beat ${m.opponent}` : `Bat first vs ${m.opponent}`}
          </p>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {oversLabel(t.overs)}
            {t.round?.closesAt ? ` · round closes in ${timeLeft(t.round.closesAt)}` : ''} · play in the Quest app
          </p>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, hint, icon: Icon }: { label: string; value: string; hint?: string; icon: typeof Trophy }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
        <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-[var(--color-muted-foreground)]">{hint}</p>}
    </div>
  );
}

/** Career numbers across every tournament. */
export function StatStrip({ stats: s }: { stats: PlayerDashboard['stats'] }) {
  return (
    <section aria-label="Your stats" className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      <Stat icon={Swords} label="Matches" value={String(s.matches)} hint={`${s.wins}W · ${s.losses}L`} />
      <Stat icon={TrendingUp} label="Win rate" value={s.winRate != null ? `${s.winRate}%` : '—'} />
      <Stat icon={Target} label="Runs" value={String(s.runs)} hint={`${s.innings} innings`} />
      <Stat icon={Flame} label="6s" value={String(s.sixes)} />
      <Stat icon={Flame} label="4s" value={String(s.fours)} />
      <Stat icon={Shield} label="Best" value={s.highest != null ? String(s.highest) : '—'} hint="highest innings" />
      <Stat icon={Trophy} label="Titles" value={String(s.tournamentsWon)} hint={`${s.tournamentsPlayed} played`} />
    </section>
  );
}

/** Rating and how far it is to the next tier. */
export function TierProgress({ stats: s }: { stats: PlayerDashboard['stats'] }) {
  const floor = TIER_THRESHOLDS.find((t) => t.tier === pointsToTier(s.ratingPoints))?.minPoints ?? 0;
  const ceiling = s.nextTier ? s.ratingPoints + s.nextTier.pointsNeeded : s.ratingPoints;
  const pct = s.nextTier ? Math.max(4, Math.round(((s.ratingPoints - floor) / Math.max(1, ceiling - floor)) * 100)) : 100;
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">Tier {s.skillTier}</span>
        <span className="tabular-nums text-[var(--color-muted-foreground)]">{s.ratingPoints} pts</span>
      </div>
      <div className="h-2 rounded-full bg-[var(--color-muted)]" aria-hidden>
        <div className="h-2 rounded-full bg-[var(--color-primary)]" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-[var(--color-muted-foreground)]">
        {s.nextTier ? `${s.nextTier.pointsNeeded} points to Tier ${s.nextTier.tier} · +30 a win` : 'Top tier reached'}
      </p>
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof Trophy; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-[var(--color-primary)]" aria-hidden />{title}</h2>
      {children}
    </section>
  );
}

export function RecentForm({ d }: { d: PlayerDashboard }) {
  return (
    <Panel title="Recent form" icon={TrendingUp}>
      {d.recentForm.length === 0 ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">Your results will show here after your first match.</p>
      ) : (
        <>
          <div className="flex gap-1.5" aria-label="Last results">
            {d.recentForm.map((f) => (
              <span
                key={f.matchId}
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold',
                  f.result === 'W' ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]'
                )}
              >
                {f.result}
              </span>
            ))}
          </div>
          <ul className="space-y-1.5 text-sm">
            {d.recentForm.slice(0, 3).map((f) => (
              <li key={f.matchId} className="flex justify-between gap-2">
                <span className="truncate">vs {f.opponent}</span>
                <span className="tabular-nums text-[var(--color-muted-foreground)]">{f.myScore ?? '–'} – {f.opponentScore ?? '–'}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

export function LiveNow({ d }: { d: PlayerDashboard }) {
  if (d.liveTournaments.length === 0) return null;
  return (
    <Panel title="Live now" icon={Radio}>
      <ul className="space-y-1 text-sm">
        {d.liveTournaments.map((t) => (
          <li key={t.id}>
            <Link to={`/tournaments/${t.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--color-muted)]/40">
              <span className="min-w-0">
                <span className="block truncate font-medium">{t.name}</span>
                <span className="text-xs text-[var(--color-muted-foreground)]">Round {t.roundNumber} · {t.playerCount} players · {oversLabel(t.overs)}</span>
              </span>
              <span className="shrink-0 text-xs font-semibold text-[var(--color-primary)]">Watch</span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function OpenToJoin({ d }: { d: PlayerDashboard }) {
  if (d.openTournaments.length === 0) return null;
  return (
    <Panel title="Open to join" icon={Trophy}>
      <ul className="space-y-2 text-sm">
        {d.openTournaments.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-2">
            <span className="min-w-0">
              <span className="block truncate font-medium">{t.name}</span>
              <span className="text-xs text-[var(--color-muted-foreground)]">
                {formatDateTime(t.startDate)} · {t.playerCount}{t.maxPlayers ? `/${t.maxPlayers}` : ''} · {oversLabel(t.overs)}
              </span>
            </span>
            <Link to={`/join/${t.id}`} className={buttonVariants({ size: 'sm', variant: 'outline', className: 'shrink-0 gap-1' })}>
              Join <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
