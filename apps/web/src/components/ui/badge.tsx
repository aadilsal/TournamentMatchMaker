import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-[var(--color-primary)]/15 text-[var(--color-accent-foreground)] border-[var(--color-primary)]/30',
  success: 'bg-[var(--color-primary)]/15 text-[var(--color-primary)] border-[var(--color-primary)]/30',
  warning: 'bg-white/10 text-white/80 border-white/20',
  danger: 'bg-red-500/15 text-red-400 border-red-500/30',
  info: 'bg-[var(--color-primary)]/10 text-white border-[var(--color-primary)]/25',
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

/**
 * Single source of truth for status colours across player-facing and admin UI.
 * Covers every status/phase enum in @vr-tournament/shared; unknown values fall
 * back to a neutral badge with the raw value humanised.
 */
const STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  // Tournament status
  draft: { label: 'Draft', variant: 'warning' },
  open: { label: 'Open', variant: 'success' },
  closed: { label: 'Closed', variant: 'neutral' },
  in_progress: { label: 'Live', variant: 'info' },
  completed: { label: 'Completed', variant: 'neutral' },
  // Tournament / round phase
  normal: { label: 'Normal', variant: 'info' },
  knockout: { label: 'Knockout', variant: 'warning' },
  // Match status
  pending_confirmation: { label: 'Pending', variant: 'warning' },
  confirmed: { label: 'Confirmed', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'danger' },
  expired: { label: 'Expired', variant: 'neutral' },
  // Participant status
  active: { label: 'Active', variant: 'success' },
  eliminated: { label: 'Eliminated', variant: 'danger' },
  advanced: { label: 'Advanced', variant: 'success' },
  out: { label: 'Out', variant: 'danger' },
  // Slot status
  available: { label: 'Available', variant: 'success' },
  full: { label: 'Full', variant: 'warning' },
  locked: { label: 'Locked', variant: 'danger' },
  // Buyback / notification status
  pending: { label: 'Pending', variant: 'warning' },
  failed: { label: 'Failed', variant: 'danger' },
  sent: { label: 'Sent', variant: 'success' },
};

export function statusBadge(status: string) {
  const key = status.replace(/\s+/g, '_').toLowerCase();
  return (
    STATUS_MAP[key] ?? {
      label: status.replace(/_/g, ' '),
      variant: 'neutral' as BadgeVariant,
    }
  );
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const { label, variant } = statusBadge(status);
  return (
    <Badge variant={variant} className={cn('capitalize', className)}>
      {label}
    </Badge>
  );
}
