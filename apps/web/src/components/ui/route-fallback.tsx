import { Skeleton, GridSkeleton, ListSkeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export type RouteFallbackVariant =
  | 'marketing'
  | 'app'
  | 'app-content'
  | 'auth'
  | 'admin'
  | 'admin-content'
  | 'detail';

function HeaderSkeleton() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-card)]/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
          <Skeleton className="h-4 w-28 hidden sm:block" />
        </div>
        <div className="hidden md:flex items-center gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-md" />
          ))}
        </div>
        <Skeleton className="h-8 w-8 rounded-md md:hidden" />
      </div>
    </header>
  );
}

function AdminSidebarSkeleton() {
  return (
    <aside className="hidden lg:flex w-56 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-card)] p-4 gap-2">
      <Skeleton className="h-5 w-24 mb-4" />
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full rounded-md" />
      ))}
    </aside>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="flex items-center gap-4">
        <Skeleton className="h-20 w-20 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
      ))}
      <Skeleton className="h-10 w-full rounded-md" />
    </div>
  );
}

export function DetailPageSkeleton() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="space-y-3">
        <Skeleton className="h-9 w-2/3 max-w-md" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-10 w-32 rounded-md" />
        <Skeleton className="h-10 w-36 rounded-md" />
      </div>
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-6 space-y-4">
        <Skeleton className="h-6 w-24" />
        <div className="flex gap-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-24 rounded-md" />
          ))}
        </div>
        <ListSkeleton count={4} />
      </div>
    </div>
  );
}

export function RouteFallback({
  variant = 'app',
  className,
}: {
  variant?: RouteFallbackVariant;
  className?: string;
}) {
  if (variant === 'marketing') {
    return (
      <div className={cn('min-h-screen bg-[var(--color-background)]', className)}>
        <div className="border-b border-[var(--color-border)]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            <Skeleton className="h-8 w-32" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-20 rounded-md" />
              <Skeleton className="h-9 w-24 rounded-md" />
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 lg:py-24 space-y-8">
          <Skeleton className="h-12 w-full max-w-2xl" />
          <Skeleton className="h-12 w-full max-w-xl" />
          <Skeleton className="h-5 w-full max-w-lg" />
          <div className="flex gap-3 pt-4">
            <Skeleton className="h-11 w-36 rounded-md" />
            <Skeleton className="h-11 w-32 rounded-md" />
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-16">
          <GridSkeleton cols={3} count={3} />
        </div>
      </div>
    );
  }

  if (variant === 'auth') {
    return (
      <div className={cn('min-h-[70vh] flex items-center justify-center px-4', className)}>
        <div className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-8 space-y-6">
          <div className="flex flex-col items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-16" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'admin' || variant === 'admin-content') {
    return (
      <div className={cn('min-h-screen flex bg-[var(--color-background)]', className)}>
        {variant === 'admin' && <AdminSidebarSkeleton />}
        <div className="flex-1 min-w-0">
          {variant === 'admin' && (
            <div className="border-b border-[var(--color-border)] px-4 sm:px-6 h-14 flex items-center">
              <Skeleton className="h-5 w-32" />
            </div>
          )}
          <div className="p-4 sm:p-6 space-y-6">
            <div className="space-y-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-72" />
            </div>
            <GridSkeleton cols={3} count={6} />
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'detail') {
    return (
      <div className={cn('max-w-7xl mx-auto px-4 sm:px-6 py-8', className)}>
        <DetailPageSkeleton />
      </div>
    );
  }

  if (variant === 'app-content') {
    return (
      <div className={cn('max-w-7xl mx-auto px-4 sm:px-6 py-8', className)}>
        <div className="space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <GridSkeleton cols={3} count={6} />
        </div>
      </div>
    );
  }

  return (
    <div className={cn('min-h-screen flex flex-col bg-[var(--color-background)]', className)}>
      <HeaderSkeleton />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8">
        <div className="space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <GridSkeleton cols={3} count={6} />
        </div>
      </main>
    </div>
  );
}
