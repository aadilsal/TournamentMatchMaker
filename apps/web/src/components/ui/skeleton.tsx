import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded-md bg-[var(--color-muted)]/50', className)} />
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-6 space-y-4">
      <Skeleton className="h-4 w-2/5" />
      <Skeleton className="h-3 w-3/5" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
      <Skeleton className="h-8 w-24 mt-2" />
    </div>
  );
}

export function GridSkeleton({ cols = 3, count = 6 }: { cols?: 2 | 3; count?: number }) {
  return (
    <div className={cn(
      'grid gap-4 grid-cols-1',
      cols === 2 ? 'md:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-3'
    )}>
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

export function ListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4 flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-8 w-16" />
        </div>
      ))}
    </div>
  );
}
