import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ACHIEVEMENT_BY_CODE, type AchievementDef, type NotificationNewEvent } from '@vr-tournament/shared';
import { useSocketEvent } from '@/hooks/useSocket';
import { buttonVariants } from '@/components/ui/button';
import { BadgeArt, TitlePlate, TIER_STYLE } from './BadgeArt';

/** Game-style pop-up when a title or badge unlocks; queues several in a row. */
export function UnlockCelebration({ enabled }: { enabled: boolean }) {
  const [queue, setQueue] = useState<AchievementDef[]>([]);
  const reduce = useReducedMotion();
  const queryClient = useQueryClient();
  const current = queue[0];

  useSocketEvent(
    'notification:new',
    (e: NotificationNewEvent) => {
      if (e.notification.type !== 'achievement_unlocked') return;
      const def = ACHIEVEMENT_BY_CODE.get(String((e.notification.payload as { code?: string }).code ?? ''));
      if (def) setQueue((q) => [...q, def]);
      void queryClient.invalidateQueries({ queryKey: ['achievements'] });
    },
    enabled
  );

  const next = () => setQueue((q) => q.slice(1));
  useEffect(() => {
    if (!current) return;
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && next();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current]);

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          key={current.code}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={next}
          role="dialog"
          aria-modal="true"
          aria-label={`${current.kind === 'title' ? 'New title' : 'Badge unlocked'}: ${current.name}`}
        >
          <motion.div
            className="relative flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl border border-[var(--color-border)] bg-[var(--color-card)] px-6 pb-6 pt-8 text-center"
            initial={{ scale: reduce ? 1 : 0.7, y: reduce ? 0 : 30 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: reduce ? 1 : 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            onClick={(ev) => ev.stopPropagation()}
          >
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-40 rounded-t-3xl"
              style={{ background: `radial-gradient(60% 80% at 50% 0%, ${TIER_STYLE[current.tier].glow}, transparent 70%)` }}
              aria-hidden
            />
            <p className="relative text-xs font-bold uppercase tracking-[0.2em] text-amber-300">
              {current.kind === 'title' ? 'New title unlocked' : 'Badge unlocked'}
            </p>
            <motion.div
              className="relative"
              initial={{ rotateY: reduce ? 0 : 180, scale: reduce ? 1 : 0.5 }}
              animate={{ rotateY: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 160, damping: 14, delay: 0.1 }}
            >
              <BadgeArt icon={current.icon} tier={current.tier} size={128} />
            </motion.div>
            {current.kind === 'title' ? (
              <TitlePlate name={current.name} tier={current.tier} icon={current.icon} />
            ) : (
              <h2 className="text-2xl font-extrabold">{current.name}</h2>
            )}
            <p className="text-sm text-[var(--color-muted-foreground)]">
              {current.description} · {TIER_STYLE[current.tier].label}
            </p>
            <div className="flex w-full gap-2">
              <button type="button" onClick={next} className={buttonVariants({ variant: 'outline', className: 'flex-1' })}>
                {queue.length > 1 ? 'Next' : 'Nice!'}
              </button>
              <Link to="/profile?tab=badges" onClick={() => setQueue([])} className={buttonVariants({ className: 'flex-1' })}>
                See collection
              </Link>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
