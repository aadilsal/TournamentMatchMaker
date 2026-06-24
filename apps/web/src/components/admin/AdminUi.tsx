import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { SKILL_TIER_OPTIONS } from '@vr-tournament/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function AdminFieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-[var(--color-destructive)] mt-1">{message}</p>;
}

const adminSelectClass =
  'w-full h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm';

export function AdminSkillTierSelect({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <select
      className={cn(adminSelectClass, className)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {SKILL_TIER_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
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
    <select
      className={cn(
        'w-full h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 text-sm',
        className
      )}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
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
            <select
              className="w-full h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 text-sm"
              value={String(limit)}
              onChange={(e) => onLimitChange(Number(e.target.value))}
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
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
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <AdminCard className="p-4">
      <p className="text-xs font-medium text-[var(--color-muted-foreground)] uppercase tracking-wide">
        {label}
      </p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs text-[var(--color-muted-foreground)] mt-1">{sub}</p>}
    </AdminCard>
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

export function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    open: 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]',
    draft: 'bg-zinc-500/15 text-zinc-400',
    closed: 'bg-white/10 text-white/70',
    in_progress: 'bg-[var(--color-primary)]/20 text-white',
    completed: 'bg-white/10 text-white/80',
    pending_confirmation: 'bg-white/10 text-white/70',
    confirmed: 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]',
    cancelled: 'bg-red-500/15 text-red-400',
    expired: 'bg-zinc-500/15 text-zinc-400',
    active: 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]',
    eliminated: 'bg-red-500/15 text-red-400',
    confirmed_booking: 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]',
  };
  const key = status.replace(/\s/g, '_');
  return (
    <span
      className={cn(
        'inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize',
        colors[key] ?? 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]'
      )}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}
