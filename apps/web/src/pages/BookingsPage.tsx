import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Booking, Match } from '@vr-tournament/shared';
import { apiGet, apiDelete, getAccessToken } from '@/lib/api';
import { LIVE_QUERY_KEYS, LIVE_STALE_TIME } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import { Badge, bookingStatusBadge } from '@/components/ui/badge';
import { ListSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Calendar, MapPin, Clock, Trophy } from 'lucide-react';
import { motion } from 'motion/react';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { QueryError } from '@/components/ui/query-error';
import { toast } from '@/components/ui/toast';
import { getUserErrorMessage } from '@/lib/user-messages';
import { formatDateTime, formatDateTimeRange } from '@/lib/format';

// shortcut: `tournament` is read only if /bookings/me returns it; drop the cast once Booking carries it.
type BookingRow = Booking & { tournament?: { id: string; name: string } | null };

const STATUS_HINT: Record<string, string> = {
  confirmed: 'Your seat is held.',
  pending: 'Waiting for the venue to confirm — your seat is not guaranteed yet.',
};

export function BookingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  useEffect(() => {
    if (!getAccessToken()) navigate('/login');
  }, [navigate]);

  const { data: bookings = [], isLoading, error, refetch } = useQuery({
    queryKey: LIVE_QUERY_KEYS.bookings,
    queryFn: () => apiGet<BookingRow[]>('/bookings/me'),
    staleTime: LIVE_STALE_TIME,
  });

  // Same cache as My Matches; used to tell which bookings already have an opponent.
  const { data: matches = [] } = useQuery({
    queryKey: LIVE_QUERY_KEYS.matches,
    queryFn: () => apiGet<Match[]>('/matches/me'),
    staleTime: LIVE_STALE_TIME,
  });
  const matchedSlotIds = new Set(
    matches
      .filter((m) => ['pending_confirmation', 'confirmed', 'in_progress'].includes(m.status))
      .flatMap((m) => [m.mySlot?.id, m.timeSlotId])
      .filter(Boolean)
  );
  // Only tournament entries get paired; a casual arena booking never waits for an opponent.
  const waitingForOpponent = bookings.some(
    (b) => b.status !== 'cancelled' && !!b.tournament && !matchedSlotIds.has(b.timeSlotId)
  );

  const cancelBooking = useMutation({
    mutationFn: (id: string) => apiDelete<Booking>(`/bookings/${id}`),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: LIVE_QUERY_KEYS.bookings });
      const previous = queryClient.getQueryData<Booking[]>(LIVE_QUERY_KEYS.bookings);
      queryClient.setQueryData<Booking[]>(
        LIVE_QUERY_KEYS.bookings,
        (old) => old?.filter((b) => b.id !== id) ?? []
      );
      return { previous };
    },
    onError: (err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(LIVE_QUERY_KEYS.bookings, context.previous);
      }
      toast.error('Couldn’t cancel your booking', { description: getUserErrorMessage(err) });
    },
    onSuccess: () => toast.success('Booking cancelled.'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: LIVE_QUERY_KEYS.bookings }),
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
      ) : error ? (
        <QueryError error={error} resource="your bookings" onRetry={() => refetch()} />
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
                  <div className="min-w-0">
                    {booking.tournament?.name && (
                      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)] flex items-center gap-1 mb-0.5">
                        <Trophy className="h-3 w-3 shrink-0" />
                        <span className="truncate">{booking.tournament.name}</span>
                      </p>
                    )}
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
                        {formatDateTimeRange(booking.slot.startTime, booking.slot.endTime)}
                      </p>
                    )}
                    <p className="flex items-center gap-2 text-[var(--color-muted-foreground)]">
                      <Calendar className="h-3.5 w-3.5 shrink-0" />
                      Booked {formatDateTime(booking.createdAt)}
                    </p>
                    {STATUS_HINT[booking.status] && (
                      <p className="text-xs text-[var(--color-muted-foreground)]">{STATUS_HINT[booking.status]}</p>
                    )}
                    {booking.status !== 'cancelled' && matchedSlotIds.has(booking.timeSlotId) && (
                      <Link to="/matches" className="inline-flex min-h-9 items-center text-[var(--color-primary)] hover:underline font-medium">
                        Opponent found — view match
                      </Link>
                    )}
                  </div>
                  {booking.status !== 'cancelled' && (
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={cancelBooking.isPending}
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'Cancel this booking?',
                          description: `Your seat at ${booking.venue?.name ?? 'the venue'}${
                            booking.slot ? ` on ${formatDateTime(booking.slot.startTime)}` : ''
                          } will be released for someone else. You can book again if seats are left.`,
                          confirmLabel: 'Cancel booking',
                          cancelLabel: 'Keep booking',
                        });
                        if (ok) cancelBooking.mutate(booking.id);
                      }}
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

      {waitingForOpponent && (
        <p className="text-center text-sm text-[var(--color-muted-foreground)]">
          Your match will appear on{' '}
          <Link to="/matches" className="text-[var(--color-primary)] hover:underline font-medium">
            My Matches
          </Link>{' '}
          once an opponent is found.
        </p>
      )}
    </div>
  );
}
