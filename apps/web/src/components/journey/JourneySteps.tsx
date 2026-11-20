import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { JOURNEY_STEPS } from '@/lib/journey';

/** Progress through the guided flow: 1 Tournament · 2 Where you play · 3 Play. */
export function JourneySteps({ current }: { current: 0 | 1 | 2 }) {
  return (
    <ol className="flex flex-wrap items-center justify-center gap-2 text-sm" aria-label="Your progress">
      {JOURNEY_STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex items-center gap-2 min-w-0" aria-current={active ? 'step' : undefined}>
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                done && 'bg-[var(--color-primary)] border-[var(--color-primary)] text-[var(--color-primary-foreground)]',
                active && 'border-[var(--color-primary)] text-[var(--color-primary)]',
                !done && !active && 'border-[var(--color-border)] text-[var(--color-muted-foreground)]'
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
            </span>
            <span className={cn(active ? 'font-semibold' : 'hidden sm:inline text-[var(--color-muted-foreground)]')}>
              {label}
            </span>
            {i < JOURNEY_STEPS.length - 1 && <span className="h-px w-5 sm:w-10 bg-[var(--color-border)]" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
