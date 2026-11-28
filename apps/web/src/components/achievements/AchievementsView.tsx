import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
  ACHIEVEMENT_CATEGORY_LABELS,
  type AchievementCategory,
  type AchievementView,
  type PlayerAchievements,
} from '@vr-tournament/shared';
import { apiPut } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { LIVE_QUERY_KEYS } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { BadgeArt, TitlePlate, TIER_STYLE } from './BadgeArt';

const ORDER: AchievementCategory[] = ['firsts', 'milestones', 'feats', 'streaks', 'tournament', 'tier'];

/** A player's titles and badges: progress, rarity, and (for the owner) which title to show. */
export function AchievementsView({ data, editable = false, initialFilter = 'all' }: { data: PlayerAchievements; editable?: boolean; initialFilter?: 'all' | 'earned' }) {
  const [filter, setFilter] = useState<'all' | 'earned'>(initialFilter);
  const queryClient = useQueryClient();
  const choose = useMutation({
    mutationFn: (code: string | null) => apiPut<{ displayTitle: string | null }>('/players/me/title', { code }),
    onSuccess: (r) => {
      toast.success(r.displayTitle ? `Now showing "${r.displayTitle}"` : 'Title hidden');
      for (const key of [['achievements', 'me'], ['player-dashboard'], LIVE_QUERY_KEYS.me, ['leaderboards']]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });

  const titles = data.achievements.filter((a) => a.kind === 'title');
  const pct = Math.round((data.earnedCount / Math.max(1, data.total)) * 100);
  const showing = titles.find((t) => t.name === data.displayTitle);

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--color-border)] bg-gradient-to-r from-amber-500/10 via-[var(--color-card)] to-fuchsia-500/10 p-5">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">Collection</p>
          <p className="text-3xl font-black tabular-nums">
            {data.earnedCount} <span className="text-lg font-semibold text-[var(--color-muted-foreground)]">/ {data.total} earned</span>
          </p>
          <div className="h-2 w-56 max-w-full rounded-full bg-[var(--color-muted)]" aria-hidden>
            <div className="h-2 rounded-full bg-gradient-to-r from-amber-400 to-fuchsia-500" style={{ width: `${Math.max(3, pct)}%` }} />
          </div>
        </div>
        <div className="space-y-1.5 text-right">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">Title</p>
          {showing ? (
            <TitlePlate name={showing.name} tier={showing.tier} icon={showing.icon} />
          ) : (
            <p className="text-sm text-[var(--color-muted-foreground)]">None yet: hit 10 sixes or 25 fours</p>
          )}
        </div>
      </section>

      <div className="flex gap-2" role="group" aria-label="Show badges">
        {(['all', 'earned'] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'} onClick={() => setFilter(f)} aria-pressed={filter === f}>
            {f === 'all' ? 'All' : 'Earned'}
          </Button>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Titles</h2>
        <p className="text-sm text-[var(--color-muted-foreground)]">Earned from career sixes and fours. {editable && 'Pick the one shown beside your name.'}</p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {titles
            .filter((t) => filter === 'all' || t.earned)
            .map((t) => (
              <li
                key={t.code}
                className={cn(
                  'flex items-center justify-between gap-3 rounded-xl border p-3',
                  t.name === data.displayTitle ? 'border-amber-400/60 bg-amber-400/10' : 'border-[var(--color-border)] bg-[var(--color-card)]'
                )}
              >
                <div className="min-w-0 space-y-1.5">
                  <span className={cn(!t.earned && 'opacity-40 grayscale')}>
                    <TitlePlate name={t.name} tier={t.tier} icon={t.icon} />
                  </span>
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    {t.description} · {t.earned ? `earned ${formatDate(t.earnedAt!)}` : `${t.progress}/${t.threshold}`}
                  </p>
                  {!t.earned && <Progress value={t.progress} max={t.threshold} />}
                </div>
                {editable && t.earned && (
                  <Button
                    size="sm"
                    variant={t.name === data.displayTitle ? 'default' : 'outline'}
                    disabled={choose.isPending || t.code === data.titleCode}
                    onClick={() => choose.mutate(t.code)}
                    tooltip="Show this title beside your name"
                  >
                    {t.code === data.titleCode || (!data.titleCode && t.name === data.displayTitle) ? 'Showing' : 'Show'}
                  </Button>
                )}
              </li>
            ))}
        </ul>
        {editable && data.titleCode && (
          <Button size="sm" variant="outline" onClick={() => choose.mutate(null)} tooltip="Always show your best title">
            Show my best automatically
          </Button>
        )}
      </section>

      {ORDER.map((cat) => {
        const list = data.achievements.filter((a) => a.kind === 'badge' && a.category === cat && (filter === 'all' || a.earned));
        if (!list.length) return null;
        return (
          <section key={cat} className="space-y-3">
            <h2 className="text-lg font-bold">{ACHIEVEMENT_CATEGORY_LABELS[cat]}</h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {list.map((a, i) => (
                <BadgeCard key={a.code} a={a} i={i} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function BadgeCard({ a, i }: { a: AchievementView; i: number }) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(i, 8) * 0.03 }}
      className={cn(
        'flex flex-col items-center gap-2 rounded-xl border p-4 text-center',
        a.earned ? 'border-[var(--color-border)] bg-[var(--color-card)]' : 'border-dashed border-[var(--color-border)] bg-transparent'
      )}
      title={`${TIER_STYLE[a.tier].label} · ${a.description}`}
    >
      <BadgeArt icon={a.icon} tier={a.tier} earned={a.earned} size={72} />
      <p className="text-sm font-semibold leading-tight">{a.name}</p>
      <p className="text-xs text-[var(--color-muted-foreground)]">{a.description}</p>
      {a.earned ? (
        <p className="text-[11px] text-[var(--color-muted-foreground)]">
          {formatDate(a.earnedAt!)}
          {a.rarity != null && ` · ${a.rarity}% of players`}
        </p>
      ) : (
        <div className="w-full space-y-1">
          <Progress value={a.progress} max={a.threshold} />
          <p className="text-[11px] tabular-nums text-[var(--color-muted-foreground)]">
            {a.progress} / {a.threshold}
          </p>
        </div>
      )}
    </motion.li>
  );
}

function Progress({ value, max }: { value: number; max: number }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-[var(--color-muted)]" role="progressbar" aria-valuenow={value} aria-valuemax={max} aria-valuemin={0}>
      <div className="h-1.5 rounded-full bg-[var(--color-primary)]" style={{ width: `${Math.round((value / Math.max(1, max)) * 100)}%` }} />
    </div>
  );
}
