import { Link } from 'react-router-dom';
import { AlertCircle, SearchX, ShieldOff } from 'lucide-react';
import { ApiClientError, getUserErrorMessage } from '@/lib/api';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const isNotFoundError = (error: unknown) =>
  error instanceof ApiClientError && error.status === 404;

/**
 * Distinguishes "you can't see this", "it doesn't exist", and "the request
 * failed" so none of them reads as empty data.
 */
export function QueryError({
  error,
  resource = 'data',
  onRetry,
  backTo,
  className,
}: {
  error: unknown;
  resource?: string;
  onRetry?: () => void;
  /** Shown on 404/403 so the page is not a dead end. */
  backTo?: { href: string; label: string };
  className?: string;
}) {
  const status = error instanceof ApiClientError ? error.status : undefined;
  const forbidden = status === 403;
  const notFound = status === 404;

  const title = forbidden
    ? 'You don’t have permission to view this'
    : notFound
      ? `This ${resource} doesn’t exist`
      : `Couldn’t load ${resource}`;

  const detail = forbidden
    ? 'Your account doesn’t cover this. Ask an admin if you need access.'
    : notFound
      ? 'It may have been removed, or the link is wrong.'
      : getUserErrorMessage(error);

  const Icon = forbidden ? ShieldOff : notFound ? SearchX : AlertCircle;

  return (
    <div
      role="alert"
      className={cn(
        'rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-8 text-center',
        className
      )}
    >
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--color-destructive)]/15 text-[var(--color-destructive)]">
        <Icon className="h-5 w-5" />
      </div>
      <p className="font-semibold">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-[var(--color-muted-foreground)]">
        {detail}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {onRetry && !forbidden && !notFound && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        )}
        {backTo && (forbidden || notFound) && (
          <Link to={backTo.href} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            {backTo.label}
          </Link>
        )}
      </div>
    </div>
  );
}
