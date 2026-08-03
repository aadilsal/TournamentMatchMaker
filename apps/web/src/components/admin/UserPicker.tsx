import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type { User } from '@vr-tournament/shared';
import { apiGet } from '@/lib/api';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { X, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const PAGE_LIMIT = 25;

/**
 * Searchable user picker. A plain <select> capped at 100 users meant an admin
 * could not reach anyone outside the first page once the platform grew, so this
 * queries the server as you type instead.
 */
export function UserPicker({
  value,
  onChange,
  label = 'User',
  error,
}: {
  value: string;
  onChange: (userId: string) => void;
  label?: string;
  error?: string;
}) {
  const inputId = useId();
  const listId = useId();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data: users = [], isFetching } = useQuery({
    queryKey: ['admin', 'users', 'picker', debounced],
    queryFn: () =>
      apiGet<User[]>(
        `/admin/users?limit=${PAGE_LIMIT}${debounced ? `&search=${encodeURIComponent(debounced)}` : ''}`
      ),
    placeholderData: keepPreviousData,
  });

  // Resolve the current selection even when it isn't in the visible page.
  const { data: selectedUser } = useQuery({
    queryKey: ['admin', 'user', 'picker-selected', value],
    queryFn: () => apiGet<User>(`/admin/users/${value}`),
    enabled: Boolean(value),
  });

  const selected = useMemo(
    () => users.find((u) => u.id === value) ?? selectedUser,
    [users, value, selectedUser]
  );

  useEffect(() => {
    if (!open) return;
    const onClickAway = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, [open]);

  useEffect(() => setHighlight(0), [debounced]);

  const choose = (user: User) => {
    onChange(user.id);
    setOpen(false);
    setSearch('');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, users.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const user = users[highlight];
      if (user) choose(user);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <Label className="text-xs" htmlFor={inputId}>
        {label}
      </Label>

      {selected && !open ? (
        <div className="mt-1 flex h-10 items-center gap-2 rounded-md border border-[var(--color-input)] bg-[var(--color-card)] px-3 text-sm">
          <span className="min-w-0 flex-1 truncate">
            {selected.username}{' '}
            <span className="text-[var(--color-muted-foreground)]">({selected.email})</span>
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="-mr-2 h-7 px-2"
            onClick={() => {
              onChange('');
              setOpen(true);
            }}
            aria-label={`Clear selected ${label.toLowerCase()}`}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <Input
          id={inputId}
          className="mt-1"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={Boolean(error)}
          placeholder="Search by username or email…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          autoComplete="off"
        />
      )}

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-card)] py-1 shadow-lg shadow-black/30"
        >
          {isFetching && users.length === 0 && (
            <li className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-muted-foreground)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Searching…
            </li>
          )}
          {!isFetching && users.length === 0 && (
            <li className="px-3 py-2 text-sm text-[var(--color-muted-foreground)]">
              {debounced ? `No users match “${debounced}”` : 'No users found'}
            </li>
          )}
          {users.map((u, i) => (
            <li key={u.id}>
              <button
                type="button"
                role="option"
                aria-selected={u.id === value}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => choose(u)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-sm',
                  i === highlight && 'bg-[var(--color-muted)]/60'
                )}
              >
                <span className="min-w-0 flex-1 truncate">
                  {u.username}{' '}
                  <span className="text-[var(--color-muted-foreground)]">({u.email})</span>
                </span>
                {u.id === value && <Check className="h-3.5 w-3.5 text-[var(--color-primary)]" />}
              </button>
            </li>
          ))}
          {users.length === PAGE_LIMIT && (
            <li className="border-t border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
              Showing the first {PAGE_LIMIT} matches — keep typing to narrow it down.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
