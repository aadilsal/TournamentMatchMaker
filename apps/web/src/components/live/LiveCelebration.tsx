import { useMemo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

export type BurstKind = 'four' | 'six' | 'wicket';
export type Burst = { id: number; kind: BurstKind };
export type RunsPopState = { id: number; runs: number };

const STYLE: Record<BurstKind, { text: string; gradient: string; colors: string[]; pieces: number }> = {
  four: { text: 'FOUR!', gradient: 'from-sky-300 via-emerald-300 to-sky-300', colors: ['#38bdf8', '#34d399', '#facc15', '#ffffff'], pieces: 28 },
  six: { text: 'SIX!', gradient: 'from-amber-200 via-fuchsia-400 to-amber-300', colors: ['#f59e0b', '#e879f9', '#f43f5e', '#facc15', '#ffffff'], pieces: 44 },
  wicket: { text: 'WICKET!', gradient: 'from-red-300 via-red-500 to-red-400', colors: [], pieces: 0 },
};

/** Big "FOUR!", "SIX!" or "WICKET!" popper with a confetti burst, over the scoreboard. */
export function LiveCelebration({ burst }: { burst: Burst | null }) {
  const reduce = useReducedMotion();
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center overflow-hidden" aria-hidden>
      <AnimatePresence>
        {burst && (
          <motion.div
            key={burst.id}
            className="relative flex items-center justify-center"
            initial={{ opacity: 0, scale: reduce ? 1 : 0.3, rotate: reduce ? 0 : -8 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: reduce ? 1 : 1.35 }}
            transition={{ type: 'spring', stiffness: 420, damping: 17 }}
          >
            {!reduce && STYLE[burst.kind].pieces > 0 && <Confetti kind={burst.kind} />}
            <span
              className={cn(
                'bg-gradient-to-r bg-clip-text text-6xl font-black italic tracking-tight text-transparent sm:text-8xl',
                'drop-shadow-[0_6px_28px_rgba(0,0,0,0.65)]',
                STYLE[burst.kind].gradient
              )}
            >
              {STYLE[burst.kind].text}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Confetti({ kind }: { kind: BurstKind }) {
  const { colors, pieces } = STYLE[kind];
  const bits = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => {
        const angle = (i / pieces) * Math.PI * 2 + Math.random() * 0.4;
        const dist = 110 + Math.random() * (kind === 'six' ? 230 : 160);
        return {
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist,
          rotate: (Math.random() - 0.5) * 720,
          color: colors[i % colors.length],
          w: 5 + Math.random() * 6,
          h: 9 + Math.random() * 9,
          delay: Math.random() * 0.06,
        };
      }),
    [colors, pieces, kind]
  );
  return (
    <>
      {bits.map((b, i) => (
        <motion.span
          key={i}
          className="absolute left-1/2 top-1/2 rounded-[2px]"
          style={{ width: b.w, height: b.h, background: b.color }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.5 }}
          animate={{ x: b.x, y: b.y + 70, opacity: 0, rotate: b.rotate, scale: 1 }}
          transition={{ duration: 1.35, ease: [0.16, 1, 0.3, 1], delay: b.delay }}
        />
      ))}
    </>
  );
}

/** Floating "+2" that rises off the score. */
export function RunsPop({ pop }: { pop: RunsPopState | null }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {pop && (
        <motion.span
          key={pop.id}
          aria-hidden
          className="pointer-events-none absolute -top-2 right-0 text-2xl font-extrabold text-emerald-300"
          initial={{ opacity: 0, y: reduce ? 0 : 8, scale: 0.8 }}
          animate={{ opacity: 1, y: reduce ? 0 : -28, scale: 1 }}
          exit={{ opacity: 0, y: reduce ? 0 : -44 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          +{pop.runs}
        </motion.span>
      )}
    </AnimatePresence>
  );
}
