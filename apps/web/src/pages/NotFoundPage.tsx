import { Link } from 'react-router-dom';
import { SearchX } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <div className="flex min-h-[50dvh] items-center justify-center">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
          <SearchX className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Page not found</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted-foreground)]">
          The link may be mistyped or out of date.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link to="/tournaments" className={buttonVariants()}>
            Browse tournaments
          </Link>
          <Link to="/venues" className={buttonVariants({ variant: 'outline' })}>
            Find a venue
          </Link>
        </div>
      </div>
    </div>
  );
}
