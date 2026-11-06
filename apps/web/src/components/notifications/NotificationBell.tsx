import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Notification } from '@vr-tournament/shared';
import { apiGet, apiPatch } from '@/lib/api';
import { LIVE_QUERY_KEYS, LIVE_STALE_TIME } from '@/lib/query-keys';
import { formatDateTime, formatMoneyCents, humanizeEnum } from '@/lib/format';
import { notificationLink } from '@/lib/notification-link';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';

const TEXT: Record<string, (p: Record<string, unknown>) => string> = {
  match_found: () => 'You have a new match. Open My Matches to see your opponent.',
  match_confirmed: () => 'Your match is confirmed.',
  match_declined: () => 'Your opponent declined the match. We’re finding you another.',
  match_expired: () => 'A match expired before it was played.',
  match_won: () => 'You won your match!',
  match_lost: () => 'You lost your match.',
  opponent_withdrew_requeued: () => 'Your opponent withdrew. You’re back in the queue for a new match.',
  tournament_registered: (p) =>
    typeof p.tournamentName === 'string' ? `You’re registered for ${p.tournamentName}.` : 'You’re registered for a tournament.',
  tournament_live: (p) =>
    typeof p.tournamentName === 'string' ? `${p.tournamentName} has started.` : 'Your tournament has started.',
  buyback_completed: (p) =>
    `Buyback complete${typeof p.amountCents === 'number' ? ` (${formatMoneyCents(p.amountCents)})` : ''} — you’re back in.`,
  buyback_refunded: (p) =>
    `Your buyback${typeof p.amountCents === 'number' ? ` of ${formatMoneyCents(p.amountCents)}` : ''} was refunded.`,
};

/** Admin broadcasts carry their own message; system events are described from their type. */
export function notificationText(n: Pick<Notification, 'type' | 'payload'>): string {
  const payload = n.payload ?? {};
  if (typeof payload.message === 'string' && payload.message.trim()) return payload.message;
  return TEXT[n.type]?.(payload) ?? humanizeEnum(n.type);
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: LIVE_QUERY_KEYS.notifications,
    queryFn: () => apiGet<Notification[]>('/notifications?limit=10'),
    staleTime: LIVE_STALE_TIME,
  });

  const unreadCount = data?.filter((n) => !n.read).length ?? 0;

  const markReadMutation = useMutation({
    mutationFn: (id: string) => apiPatch(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIVE_QUERY_KEYS.notifications }),
  });

  const markAllMutation = useMutation({
    mutationFn: () => apiPatch('/notifications/read-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIVE_QUERY_KEYS.notifications }),
  });

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(!open)}
        className="relative"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span
            aria-hidden
            className="absolute top-0.5 right-0.5 h-4 min-w-4 px-1 rounded-full bg-[var(--color-primary)] text-[10px] flex items-center justify-center text-white"
          >
            {unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="fixed inset-x-2 top-16 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg shadow-lg z-50">
          <div className="flex items-center justify-between px-3 py-1 border-b border-[var(--color-border)]">
            <span className="font-medium text-sm">Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                className="min-h-10 px-2 text-xs text-[var(--color-primary)]"
                onClick={() => markAllMutation.mutate()}
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[min(24rem,70dvh)] overflow-y-auto">
            {!data?.length && (
              <p className="p-4 text-sm text-[var(--color-muted-foreground)]">No notifications</p>
            )}
            {data?.map((n) => (
              <button
                type="button"
                key={n.id}
                className={`w-full text-left p-3 text-sm border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-muted)] ${!n.read ? 'font-medium' : 'text-[var(--color-muted-foreground)]'}`}
                onClick={() => {
                  if (!n.read) markReadMutation.mutate(n.id);
                  const to = notificationLink(n);
                  if (to) {
                    setOpen(false);
                    navigate(to);
                  }
                }}
              >
                <span className="block break-words">{notificationText(n)}</span>
                <span className="block text-xs mt-0.5 font-normal opacity-70">{formatDateTime(n.createdAt)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
