import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Booking } from '@vr-tournament/shared';
import { apiGet, apiDelete, getAccessToken } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge, bookingStatusBadge } from '@/components/ui/badge';
import { ListSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Calendar, MapPin, Clock } from 'lucide-react';
import { motion } from 'motion/react';

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function BookingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!getAccessToken()) navigate('/login');
  }, [navigate]);

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['bookings'],
    queryFn: () => apiGet<Booking[]>('/bookings/me'),
  });

  const cancelBooking = useMutation({
    mutationFn: (id: string) => apiDelete<Booking>(`/bookings/${id}`),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['bookings'] });
      const previous = queryClient.getQueryData<Booking[]>(['bookings']);
      queryClient.setQueryData<Booking[]>(
        ['bookings'],
        (old) => old?.filter((b) => b.id !== id) ?? []
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['bookings'], context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['bookings'] }),
  });

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/25">
            <Calendar className="h-4.5 w-4.5 text-[var(--color-primary)]" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight">My Bookings</h1>
        </div>
        <p className="text-[var(--color-muted-foreground)] mt-1 ml-11">
          Manage your VR arena reservations
        </p>
      </motion.div>

      {isLoading ? (
        <ListSkeleton count={3} />
      ) : bookings.length === 0 ? (
        <EmptyState
          image="/images/cricket-player-3d.png"
          title="No bookings yet"
          description="Reserve your slot at a VR cricket arena to step into the game."
          action={{ label: 'Browse venues', href: '/venues' }}
        />
      ) : (
        <div className="space-y-4">
          {bookings.map((booking, i) => {
            const { label, variant } = bookingStatusBadge(booking.status);
            return (
              <motion.div
                key={booking.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: i * 0.06 }}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden"
              >
                <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{booking.venue?.name}</h3>
                    <p className="text-sm text-[var(--color-muted-foreground)] flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3.5 w-3.5" />
                      {booking.venue?.city}, {booking.venue?.country}
                    </p>
                  </div>
                  <Badge variant={variant}>{label}</Badge>
                </div>

                <div className="px-5 py-4 flex items-end justify-between gap-4">
                  <div className="space-y-1.5 text-sm">
                    {booking.slot && (
                      <p className="flex items-center gap-2 text-[var(--color-foreground)]">
                        <Clock className="h-3.5 w-3.5 text-[var(--color-muted-foreground)] shrink-0" />
                        {formatDateTime(booking.slot.startTime)} – {formatDateTime(booking.slot.endTime)}
                      </p>
                    )}
                    <p className="flex items-center gap-2 text-[var(--color-muted-foreground)]">
                      <Calendar className="h-3.5 w-3.5 shrink-0" />
                      Booked {formatDateTime(booking.createdAt)}
                    </p>
                  </div>
                  {booking.status !== 'cancelled' && (
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={cancelBooking.isPending}
                      onClick={() => cancelBooking.mutate(booking.id)}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {bookings.length === 0 && !isLoading && (
        <p className="text-center text-sm text-[var(--color-muted-foreground)]">
          Or{' '}
          <Link to="/matchmaking" className="text-[var(--color-primary)] hover:underline font-medium">
            join the matchmaking queue
          </Link>{' '}
          to get a venue assigned automatically.
        </p>
      )}
    </div>
  );
}
