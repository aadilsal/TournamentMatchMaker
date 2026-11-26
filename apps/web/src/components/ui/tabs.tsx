import { cn } from '@/lib/utils';

interface TabsProps {
  tabs: Array<{ id: string; label: string }>;
  active: string;
  onChange: (id: string) => void;
  className?: string;
}

/** One row of tabs; on narrow screens it scrolls sideways instead of wrapping. */
export function Tabs({ tabs, active, onChange, className }: TabsProps) {
  return (
    <div
      role="tablist"
      className={cn(
        '-mx-4 flex gap-1 overflow-x-auto whitespace-nowrap border-b border-[var(--color-border)] px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden',
        className
      )}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={(e) => {
            onChange(tab.id);
            e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          }}
          className={cn(
            'shrink-0 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px',
            active === tab.id
              ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
              : 'border-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
