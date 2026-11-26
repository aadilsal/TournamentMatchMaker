import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { LeaderboardEntry, LiveMatch, Tournament, TournamentLive, TournamentPlayer, TournamentStats } from '@vr-tournament/shared';
import { oversLabel, timeLeft } from '@vr-tournament/shared';
import { Crown, Flame, Headset, MapPin, Radio, Shield, Target, Trophy, Users } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs } from '@/components/ui/tabs';
import { DrawRoundsView } from '@/components/tournament/DrawRoundsView';
import { cn } from '@/lib/utils';

type TabId = 'overview' | 'live' | 'fixtures' | 'players' | 'stats';

/** Draw tournament page: overview, the live round, fixtures, players and batting stats. */
export function DrawTournamentTabs({ tournament }: { tournament: Tournament }) {
  const running = tournament.status === 'in_progress';
  const [tab, setTab] = useState<TabId>(running ? 'live' : 'overview');
  const id = tournament.id;

  const players = useQuery({ queryKey: ['tournament-players', id], queryFn: () => apiGet<TournamentPlayer[]>(`/tournaments/${id}/players`), refetchInterval: running ? 30_000 : false });
  const live = useQuery({ queryKey: ['tournament-live', id], queryFn: () => apiGet<TournamentLive>(`/tournaments/${id}/live`), enabled: running, refetchInterval: 15_000 });
  const stats = useQuery({ queryKey: ['tournament-stats', id], queryFn: () => apiGet<TournamentStats>(`/tournaments/${id}/stats`), refetchInterval: running ? 30_000 : false });

  const tabs = [
    { id: 'overview', label: 'Overview' },
    ...(running ? [{ id: 'live', label: 'Live' }] : []),
    { id: 'fixtures', label: 'Fixtures & results' },
    { id: 'players', label: `Players${players.data ? ` (${players.data.length})` : ''}` },
    { id: 'stats', label: 'Stats' },
  ];

  return (
    <div className="space-y-5">
      <Tabs tabs={tabs} active={tab} onChange={(t) => setTab(t as TabId)} />
      {tab === 'overview' && <Overview tournament={tournament} players={players.data} live={live.data} stats={stats.data} />}
      {tab === 'live' && <LiveRound live={live.data} loading={live.isLoading} />}
      {tab === 'fixtures' && <DrawRoundsView tournamentId={id} />}
      {tab === 'players' && <PlayersList players={players.data} loading={players.isLoading} />}
      {tab === 'stats' && <StatsPanel stats={stats.data} loading={stats.isLoading} />}
    </div>
  );
}

function Tile({ label, value, hint, icon: Icon }: { label: string; value: string; hint?: string; icon: typeof Trophy }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
        <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
      </p>
      <p className="mt-1.5 text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">{hint}</p>}
    </div>
  );
}

function Overview({ tournament: t, players, live, stats }: { tournament: Tournament; players?: TournamentPlayer[]; live?: TournamentLive; stats?: TournamentStats }) {
  const stillIn = players?.filter((p) => p.status === 'in').length ?? 0;
  const champion = players?.find((p) => p.status === 'champion');
  const round = live?.round;
  const top = (list?: LeaderboardEntry[]) => (list && list[0] ? `${list[0].username} · ${list[0].value}` : '—');
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile icon={Target} label="Format" value={oversLabel(t.overs)} hint="Same in every round" />
        <Tile icon={Users} label="Players" value={`${players?.length ?? t.registrationCount ?? 0}${t.maxPlayers ? ` / ${t.maxPlayers}` : ''}`} hint={t.status === 'in_progress' ? `${stillIn} still in` : undefined} />
        {t.status === 'in_progress' && round ? (
          <Tile icon={Radio} label="Now playing" value={round.label} hint={round.closesAt ? `Closes in ${timeLeft(round.closesAt)}` : undefined} />
        ) : t.status === 'completed' ? (
          <Tile icon={Crown} label="Champion" value={champion?.username ?? 'No champion'} />
        ) : (
          <Tile icon={Radio} label="Starts" value={timeLeft(t.startDate)} hint={formatDateTime(t.startDate)} />
        )}
        <Tile icon={Trophy} label="Each round" value={`${Math.round(t.roundDurationMinutes / 60) || 1}h`} hint="to play your match" />
      </div>
      {stats && stats.totals.innings > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Tournament highlights</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <Highlight label="Most 6s" value={top(stats.leaderboards.mostSixes)} />
            <Highlight label="Most 4s" value={top(stats.leaderboards.mostFours)} />
            <Highlight label="Fewest wickets lost" value={top(stats.leaderboards.fewestWicketsLost)} />
            <Highlight label="Highest innings" value={top(stats.leaderboards.highestInnings)} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Highlight({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] p-3">
      <p className="text-xs text-[var(--color-muted-foreground)]">{label}</p>
      <p className="mt-1 font-semibold truncate">{value}</p>
    </div>
  );
}

const STATE_BADGE: Record<LiveMatch['state'], { label: string; variant: 'success' | 'info' | 'neutral' | 'warning' }> = {
  to_play: { label: 'To play', variant: 'neutral' },
  batting: { label: 'Batting now', variant: 'success' },
  chasing: { label: 'Chase on', variant: 'info' },
  decided: { label: 'Result', variant: 'neutral' },
  no_result: { label: 'Not played', variant: 'warning' },
};

function LiveRound({ live, loading }: { live?: TournamentLive; loading: boolean }) {
  if (loading) return <p className="text-sm text-[var(--color-muted-foreground)]">Loading the live round…</p>;
  if (!live?.round) return <p className="text-sm text-[var(--color-muted-foreground)]">No round is being played right now.</p>;
  return (
    <div className="space-y-3">
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5 font-semibold"><span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-primary)]" aria-hidden />{live.round.label}</span>
        {live.round.closesAt && <span className="text-[var(--color-muted-foreground)]">· closes in {timeLeft(live.round.closesAt)} · updates every 15 seconds</span>}
      </p>
      <ul className="grid gap-3 md:grid-cols-2">
        {live.matches.map((m) => {
          const badge = STATE_BADGE[m.state];
          const side = (s: LiveMatch['player1'], won: boolean) => (
            <div className="flex items-center justify-between gap-2">
              <span className={cn('truncate', won && 'font-bold')}>
                {s.isBot ? `${s.username} (computer)` : s.username}
                {s.batting && <span className="ml-2 text-xs font-semibold text-[var(--color-primary)]">● batting</span>}
              </span>
              <span className="tabular-nums font-semibold">{s.score ?? '—'}</span>
            </div>
          );
          return (
            <li key={m.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 space-y-2">
              <div className="flex items-center justify-between">
                <Badge variant={badge.variant}>{badge.label}</Badge>
                {m.tieReplay && <span className="text-xs text-[var(--color-muted-foreground)]">Replay after a tie</span>}
              </div>
              {side(m.player1, m.winner === m.player1.username)}
              {side(m.player2, m.winner === m.player2.username)}
              {m.target != null && (
                <p className="text-sm font-medium text-[var(--color-primary)]">
                  🎯 {m.player1.score == null ? m.player1.username : m.player2.username} needs {m.target} to win
                </p>
              )}
              {m.winner && <p className="text-sm text-[var(--color-muted-foreground)]">{m.winner} goes through</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const PLAYER_BADGE: Record<TournamentPlayer['status'], { label: string; variant: 'success' | 'info' | 'neutral' | 'warning' }> = {
  champion: { label: '🏆 Champion', variant: 'success' },
  in: { label: 'Still in', variant: 'success' },
  registered: { label: 'Registered', variant: 'info' },
  out: { label: 'Out', variant: 'neutral' },
};

function PlayersList({ players, loading }: { players?: TournamentPlayer[]; loading: boolean }) {
  if (loading) return <p className="text-sm text-[var(--color-muted-foreground)]">Loading players…</p>;
  if (!players?.length) return <p className="text-sm text-[var(--color-muted-foreground)]">Nobody has joined yet.</p>;
  return (
    <ul className="divide-y divide-[var(--color-border)] rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]">
      {players.map((p) => {
        const badge = PLAYER_BADGE[p.status];
        return (
          <li key={p.userId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div className="min-w-0">
              <Link to={`/players/${encodeURIComponent(p.username)}`} className="font-medium hover:underline">{p.username}</Link>
              <p className="flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)]">
                {p.playingAt === 'Home' ? <Headset className="h-3 w-3" aria-hidden /> : <MapPin className="h-3 w-3" aria-hidden />}
                {p.playingAt ?? '—'} · Tier {p.skillTier}
              </p>
            </div>
            <div className="flex items-center gap-3 text-sm">
              {p.status !== 'registered' && (
                <span className="text-[var(--color-muted-foreground)] tabular-nums">
                  {p.wins}W {p.losses}L{p.roundReached ? ` · R${p.roundReached}` : ''}
                </span>
              )}
              <Badge variant={badge.variant}>{badge.label}</Badge>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Board({ title, icon: Icon, entries, empty }: { title: string; icon: typeof Trophy; entries: LeaderboardEntry[]; empty: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Icon className="h-4 w-4 text-[var(--color-primary)]" aria-hidden />{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">{empty}</p>
        ) : (
          <ol className="space-y-2">
            {entries.map((e, i) => (
              <li key={`${e.userId}-${i}`} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate"><span className="mr-2 inline-block w-4 text-[var(--color-muted-foreground)] tabular-nums">{i + 1}</span>{e.username}</span>
                <span className="tabular-nums font-semibold">{e.value}</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function StatsPanel({ stats, loading }: { stats?: TournamentStats; loading: boolean }) {
  if (loading || !stats) return <p className="text-sm text-[var(--color-muted-foreground)]">Loading stats…</p>;
  const { totals: t, leaderboards: lb } = stats;
  const waiting = 'Shows up once innings report it from the headset';
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile icon={Target} label="Runs" value={String(t.runs)} hint={`${t.innings} innings`} />
        <Tile icon={Flame} label="6s" value={String(t.sixes)} />
        <Tile icon={Flame} label="4s" value={String(t.fours)} />
        <Tile icon={Shield} label="Wickets lost" value={String(t.wicketsLost)} />
        <Tile icon={Trophy} label="Highest" value={t.highest != null ? String(t.highest) : '—'} />
      </div>
      {t.innings > 0 && t.inningsWithStats < t.innings && (
        <p className="text-xs text-[var(--color-muted-foreground)]">
          4s, 6s and wickets come from the headset: {t.inningsWithStats} of {t.innings} innings have them so far.
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Board title="Most 6s" icon={Flame} entries={lb.mostSixes} empty={waiting} />
        <Board title="Most 4s" icon={Flame} entries={lb.mostFours} empty={waiting} />
        <Board title="Fewest wickets lost" icon={Shield} entries={lb.fewestWicketsLost} empty={waiting} />
        <Board title="Most runs" icon={Target} entries={lb.mostRuns} empty="No innings played yet" />
        <Board title="Highest innings" icon={Trophy} entries={lb.highestInnings} empty="No innings played yet" />
      </div>
    </div>
  );
}
