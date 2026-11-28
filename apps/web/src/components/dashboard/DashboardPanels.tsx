import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { PlayerAchievements, PlayerCardTournament, PlayerDashboard } from '@vr-tournament/shared';
import { useLiveMatch } from '@/hooks/useLiveScores';
import { apiGet } from '@/lib/api';
import { BadgeArt } from '@/components/achievements/BadgeArt';
import { RATING_LOSS_POINTS, RATING_WIN_POINTS, oversLabel, tierFloor, timeLeft } from '@vr-tournament/shared';
import { ArrowRight, Flame, Medal, Radio, Shield, Swords, Target, Trophy, TrendingUp } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

/** The one thing to do now: the first match where it is this player's turn. */
export function NextUp({ tournaments }: { tournaments: PlayerCardTournament[] }) {
  const t = tournaments.find((x) => x.match?.state === 'your_turn');
  if (!t?.match) return null;
  const m = t.match;
  const chasing = m.opponentScore >= 0;
  if (m.opponentBattingSince) return <OpponentBatting t={t} />;
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

/** "hamza is batting now": the opponent holds the turn; you chase once they finish. */
function OpponentBatting({ t }: { t: PlayerCardTournament }) {
  const m = t.match!;
  const live = useLiveMatch(m.id);
  const batting = live.data?.innings.find((s) => s.state === 'batting');
  return (
    <section
      aria-label="Opponent batting"
      aria-live="polite"
      className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-400/40 bg-gradient-to-r from-amber-500/15 to-[var(--color-card)] p-5"
    >
      <div className="flex items-center gap-4">
        <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-400/20 text-amber-300">
          <Radio className="h-6 w-6" aria-hidden />
          <span className="absolute right-1 top-1 h-2.5 w-2.5 animate-pulse rounded-full bg-amber-400" aria-hidden />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">Batting now · {t.name}</p>
          <p className="text-xl font-extrabold">
            {m.opponent} is batting
            {batting && batting.legalBalls > 0 && (
              <span className="ml-2 tabular-nums text-amber-300">
                {batting.runs}/{batting.wickets} <span className="text-sm font-semibold">({batting.overs})</span>
              </span>
            )}
          </p>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            You'll chase their score once they finish. We'll alert you when it's your turn.
            {m.turnFreesAt ? ` If they drop out, their innings counts as 0 at ${clockTime(m.turnFreesAt)}.` : ''}
          </p>
        </div>
      </div>
      <Link to={`/matches/${m.id}/live`} title="Watch their innings ball by ball" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
        Watch live
      </Link>
    </section>
  );
}

/** "3:40 PM" in the viewer's own time zone. */
export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
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
      <Stat icon={Trophy} label="Trophies" value={String(s.tournamentsWon)} hint={`tournaments won of ${s.tournamentsPlayed}`} />
    </section>
  );
}

/** Rating and how far it is to the next tier. */
export function TierProgress({ stats: s }: { stats: PlayerDashboard['stats'] }) {
  const floor = tierFloor(s.skillTier);
  const ceiling = s.nextTier ? s.ratingPoints + s.nextTier.pointsNeeded : s.ratingPoints;
  const pct = s.nextTier
    ? Math.min(100, Math.max(4, Math.round(((s.ratingPoints - floor) / Math.max(1, ceiling - floor)) * 100)))
    : 100;
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
        {s.nextTier ? `${s.nextTier.pointsNeeded} points to Tier ${s.nextTier.tier}` : 'Top tier reached'}
        {` · +${RATING_WIN_POINTS} a win, ${RATING_LOSS_POINTS} a loss`}
      </p>
      {s.tierProtected && (
        <p className="text-xs text-amber-300">Tier {s.skillTier} is protected: you keep it even though your points dipped.</p>
      )}
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
            <Link to={`/tournaments/${t.id}`} title="Watch live matches and results" className="group flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--color-muted)]/40">
              <span className="min-w-0">
                <span className="block truncate font-medium">{t.name}</span>
                <span className="text-xs text-[var(--color-muted-foreground)]">Round {t.roundNumber} · {t.playerCount} players · {oversLabel(t.overs)}</span>
              </span>
              <span className="shrink-0 rounded-md border border-[var(--color-primary)]/50 bg-[var(--color-primary)]/10 px-2.5 py-1 text-xs font-semibold text-[var(--color-primary)] transition-colors group-hover:bg-[var(--color-primary)] group-hover:text-white">
                Watch
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Latest unlocks and the closest badge still to earn. */
export function LatestBadges() {
  const { data } = useQuery({ queryKey: ['achievements', 'me'], queryFn: () => apiGet<PlayerAchievements>('/players/me/achievements') });
  if (!data) return null;
  const latest = data.achievements
    .filter((a) => a.earned)
    .sort((a, b) => (b.earnedAt ?? '').localeCompare(a.earnedAt ?? ''))
    .slice(0, 3);
  const nextUp = data.achievements
    .filter((a) => !a.earned && a.progress > 0)
    .sort((a, b) => b.progress / b.threshold - a.progress / a.threshold)[0];
  return (
    <Panel title={`Badges · ${data.earnedCount}/${data.total}`} icon={Medal}>
      {latest.length ? (
        <ul className="flex justify-around gap-2">
          {latest.map((a) => (
            <li key={a.code} className="flex w-20 flex-col items-center gap-1 text-center" title={a.description}>
              <BadgeArt icon={a.icon} tier={a.tier} size={52} />
              <span className="text-[11px] font-medium leading-tight">{a.name}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--color-muted-foreground)]">Play your first match to earn your first badge.</p>
      )}
      {nextUp && (
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Next: <span className="font-semibold text-[var(--color-foreground)]">{nextUp.name}</span> · {nextUp.progress}/{nextUp.threshold}
        </p>
      )}
      <Link to="/profile?tab=badges" title="See every title and badge" className={buttonVariants({ variant: 'outline', size: 'sm', className: 'w-full' })}>
        See all badges
      </Link>
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
            <Link to={`/join/${t.id}`} title="Choose where you play and join" className={buttonVariants({ size: 'sm', variant: 'outline', className: 'shrink-0 gap-1' })}>
              Join <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
