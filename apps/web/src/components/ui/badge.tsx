import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-[var(--color-primary)]/15 text-[var(--color-accent-foreground)] border-[var(--color-primary)]/30',
  success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  warning: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  danger: 'bg-red-500/15 text-red-400 border-red-500/30',
  info: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  neutral: 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)] border-[var(--color-border)]',
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

export function tournamentStatusBadge(status: string) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    open: { label: 'Open', variant: 'success' },
    draft: { label: 'Draft', variant: 'warning' },
    closed: { label: 'Closed', variant: 'neutral' },
    in_progress: { label: 'Live', variant: 'info' },
    completed: { label: 'Completed', variant: 'neutral' },
  };
  return map[status] ?? { label: status, variant: 'neutral' as BadgeVariant };
}

export function matchStatusBadge(status: string) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    pending_confirmation: { label: 'Pending', variant: 'warning' },
    confirmed: { label: 'Confirmed', variant: 'success' },
    in_progress: { label: 'Live', variant: 'info' },
    completed: { label: 'Completed', variant: 'neutral' },
    cancelled: { label: 'Cancelled', variant: 'danger' },
    expired: { label: 'Expired', variant: 'neutral' },
  };
  return map[status] ?? { label: status, variant: 'neutral' as BadgeVariant };
}

export function bookingStatusBadge(status: string) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    confirmed: { label: 'Confirmed', variant: 'success' },
    cancelled: { label: 'Cancelled', variant: 'danger' },
    pending: { label: 'Pending', variant: 'warning' },
  };
  return map[status] ?? { label: status, variant: 'neutral' as BadgeVariant };
}
