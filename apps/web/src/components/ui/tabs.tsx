import { cn } from '@/lib/utils';

interface TabsProps {
  tabs: Array<{ id: string; label: string }>;
  active: string;
  onChange: (id: string) => void;
  className?: string;
}

export function Tabs({ tabs, active, onChange, className }: TabsProps) {
  return (
    <div className={cn('flex flex-wrap gap-1 border-b border-[var(--color-border)]', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
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
