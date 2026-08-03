import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { SKILL_TIER_OPTIONS } from '@vr-tournament/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ShieldOff,
  SearchX,
  AlertCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { ApiClientError, getUserErrorMessage } from '@/lib/api';

export function AdminFieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-xs text-[var(--color-destructive)] mt-1" role="alert">
      {message}
    </p>
  );
}

/**
 * Distinguishes "you can't see this", "it doesn't exist", and "the request
 * failed". Previously all three rendered as an empty table or bare
 * "not found" text, which read as "there is no data".
 */
export function AdminQueryError({
  error,
  resource = 'data',
  onRetry,
}: {
  error: unknown;
  resource?: string;
  onRetry?: () => void;
}) {
  const status = error instanceof ApiClientError ? error.status : undefined;
  const forbidden = status === 403;
  const notFound = status === 404;

  const title = forbidden
    ? 'You don’t have permission to view this'
    : notFound
      ? `This ${resource} no longer exists`
      : `Couldn’t load ${resource}`;

  const detail = forbidden
    ? 'Your admin role doesn’t cover this data. Ask a superadmin if you need access.'
    : notFound
      ? 'It may have been deleted since this link was created.'
      : getUserErrorMessage(error);

  const Icon = forbidden ? ShieldOff : notFound ? SearchX : AlertCircle;

  return (
    <AdminCard className="p-8 text-center">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--color-destructive)]/15 text-[var(--color-destructive)]">
        <Icon className="h-5 w-5" />
      </div>
      <p className="font-semibold">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-[var(--color-muted-foreground)]">
        {detail}
      </p>
      {onRetry && !forbidden && !notFound && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </AdminCard>
  );
}

export function AdminSkillTierSelect({
  value,
  onChange,
  className,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  id?: string;
}) {
  return (
    <Select id={id} className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      {SKILL_TIER_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

export function AdminFilterBar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap gap-3 items-end mb-4 p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]',
        className
      )}
    >
      {children}
    </div>
  );
}

export function AdminFilterField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-[140px]', className)}>
      <Label className="text-xs text-[var(--color-muted-foreground)]">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export function AdminFilterSelect({
  value,
  onChange,
  options,
  placeholder = 'All',
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
}) {
  return (
    <Select
      className={cn('h-9 px-2.5', className)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

export function AdminFilterSearch({
  value,
  onChange,
  placeholder = 'Search…',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <Input
      className="h-9"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function AdminTableFooter({
  count,
  pageIndex,
  limit,
  canPrev,
  canNext,
  isFetching,
  onPrev,
  onNext,
  onLimitChange,
  totalPages,
}: {
  count: number;
  pageIndex: number;
  limit: number;
  canPrev: boolean;
  canNext: boolean;
  isFetching?: boolean;
  onPrev: () => void;
  onNext: () => void;
  onLimitChange?: (limit: number) => void;
  totalPages?: number;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mt-3 px-1">
      <p className="text-xs text-[var(--color-muted-foreground)] pb-0.5">
        {totalPages !== undefined
          ? `Page ${pageIndex + 1} of ${totalPages}`
          : `Page ${pageIndex + 1}`}
        {count > 0 ? ` · showing ${count} row${count === 1 ? '' : 's'}` : ' · no results'}
        {isFetching ? ' · loading…' : ''}
      </p>
      <div className="flex flex-wrap items-end justify-end gap-2 ml-auto">
        {onLimitChange && (
          <AdminFilterField label="Per page" className="min-w-[88px] mb-0">
            <Select
              className="h-9 px-2.5"
              aria-label="Rows per page"
              value={String(limit)}
              onChange={(e) => onLimitChange(Number(e.target.value))}
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </Select>
          </AdminFilterField>
        )}
        <Button
          size="sm"
          variant="outline"
          className="h-9 gap-1"
          onClick={onPrev}
          disabled={!canPrev}
        >
          <ChevronLeft className="h-4 w-4" />
          Prev
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-9 gap-1"
          onClick={onNext}
          disabled={!canNext}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function useClientPagination<T>(items: T[], pageSize = 10) {
  const [pageIndex, setPageIndex] = useState(0);
  const [limit, setLimit] = useState(pageSize);

  const totalPages = Math.max(1, Math.ceil(items.length / limit));

  useEffect(() => {
    setPageIndex(0);
  }, [items.length, limit]);

  useEffect(() => {
    if (pageIndex >= totalPages) setPageIndex(Math.max(0, totalPages - 1));
  }, [pageIndex, totalPages]);

  const slice = items.slice(pageIndex * limit, pageIndex * limit + limit);

  return {
    items: slice,
    pageIndex,
    limit,
    setLimit,
    canPrev: pageIndex > 0,
    canNext: pageIndex < totalPages - 1,
    prevPage: () => setPageIndex((i) => Math.max(0, i - 1)),
    nextPage: () => setPageIndex((i) => Math.min(totalPages - 1, i + 1)),
    totalPages,
    totalCount: items.length,
  };
}

export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && (
          <p className="text-sm text-[var(--color-muted-foreground)] mt-1">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function AdminCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden',
        className
      )}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  to,
}: {
  label: string;
  value: string | number;
  sub?: string;
  /** When set, the whole card links to the matching filtered list view. */
  to?: string;
}) {
  const body = (
    <>
      <p className="text-xs font-medium text-[var(--color-muted-foreground)] uppercase tracking-wide">
        {label}
      </p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs text-[var(--color-muted-foreground)] mt-1">{sub}</p>}
    </>
  );

  if (!to) return <AdminCard className="p-4">{body}</AdminCard>;

  return (
    <Link to={to} className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]">
      <AdminCard className="h-full p-4 transition-colors group-hover:border-[var(--color-primary)]/50 group-hover:bg-[var(--color-muted)]/30">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">{body}</span>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)] opacity-0 transition-opacity group-hover:opacity-100" />
        </span>
      </AdminCard>
    </Link>
  );
}

export function PagedDataTable({
  columns,
  rows,
  emptyMessage = 'No data',
  pageSize = 10,
}: {
  columns: { key: string; label: string; className?: string }[];
  rows: Record<string, React.ReactNode>[];
  emptyMessage?: string;
  pageSize?: number;
}) {
  const p = useClientPagination(rows, pageSize);

  return (
    <>
      <DataTable columns={columns} rows={p.items} emptyMessage={emptyMessage} />
      {rows.length > 0 && (
        <AdminTableFooter
          count={p.items.length}
          pageIndex={p.pageIndex}
          limit={p.limit}
          canPrev={p.canPrev}
          canNext={p.canNext}
          onPrev={p.prevPage}
          onNext={p.nextPage}
          onLimitChange={p.setLimit}
          totalPages={p.totalPages}
        />
      )}
    </>
  );
}

export function DataTable({
  columns,
  rows,
  emptyMessage = 'No data',
  onRowClick,
}: {
  columns: { key: string; label: string; className?: string }[];
  rows: Record<string, React.ReactNode>[];
  emptyMessage?: string;
  onRowClick?: (row: Record<string, React.ReactNode>, index: number) => void;
}) {
  if (rows.length === 0) {
    return (
      <AdminCard className="p-8 text-center text-sm text-[var(--color-muted-foreground)]">
        {emptyMessage}
      </AdminCard>
    );
  }

  return (
    <AdminCard className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)]/30">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'text-left font-medium text-[var(--color-muted-foreground)] px-4 py-3 whitespace-nowrap',
                  col.className
                )}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className={cn(
                'border-b border-[var(--color-border)] last:border-0',
                onRowClick && 'cursor-pointer hover:bg-[var(--color-muted)]/40'
              )}
              onClick={() => onRowClick?.(row, i)}
            >
              {columns.map((col) => (
                <td key={col.key} className={cn('px-4 py-3 align-middle', col.className)}>
                  {row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </AdminCard>
  );
}

/**
 * Admin status colours now come from the shared StatusBadge so admin and
 * player-facing surfaces cannot drift apart again.
 */
export { StatusBadge } from '@/components/ui/badge';
