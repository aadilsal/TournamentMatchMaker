import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Notification } from '@vr-tournament/shared';
import { apiGet, apiPatch } from '@/lib/api';
import { useSocketEvent } from '@/hooks/useSocket';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const items = await apiGet<Notification[]>('/notifications?limit=10');
      return items;
    },
  });

  const unreadCount = data?.filter((n) => !n.read).length ?? 0;

  useSocketEvent('notification:new', () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  });

  useSocketEvent('match:found', () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => apiPatch(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllMutation = useMutation({
    mutationFn: () => apiPatch('/notifications/read-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  return (
    <div className="relative">
      <Button variant="ghost" size="sm" onClick={() => setOpen(!open)} className="relative">
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-[var(--color-primary)] text-[10px] flex items-center justify-center text-white">
            {unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg shadow-lg z-50">
          <div className="flex items-center justify-between p-3 border-b border-[var(--color-border)]">
            <span className="font-medium text-sm">Notifications</span>
            {unreadCount > 0 && (
              <button
                className="text-xs text-[var(--color-primary)]"
                onClick={() => markAllMutation.mutate()}
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto">
            {!data?.length && (
              <p className="p-4 text-sm text-[var(--color-muted-foreground)]">No notifications</p>
            )}
            {data?.map((n) => (
              <button
                key={n.id}
                className={`w-full text-left p-3 text-sm border-b border-[var(--color-border)] hover:bg-[var(--color-muted)] ${!n.read ? 'font-medium' : 'text-[var(--color-muted-foreground)]'}`}
                onClick={() => !n.read && markReadMutation.mutate(n.id)}
              >
                <span className="capitalize">{n.type.replace(/_/g, ' ')}</span>
                <span className="block text-xs mt-0.5 opacity-70">
                  {new Date(n.createdAt).toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
