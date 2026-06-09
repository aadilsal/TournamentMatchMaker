import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Booking } from '@vr-tournament/shared';
import { apiGet, apiDelete, getAccessToken } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, MapPin, Clock } from 'lucide-react';

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

  if (isLoading) return <p>Loading bookings...</p>;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">My Bookings</h1>
      <p className="text-[var(--color-muted-foreground)] mb-8">
        Manage your venue reservations
      </p>

      {bookings.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-[var(--color-muted-foreground)]">
            No bookings yet. <a href="/venues" className="text-[var(--color-primary)] hover:underline">Browse venues</a>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => (
            <Card key={booking.id}>
              <CardHeader>
                <CardTitle className="text-lg">{booking.venue?.name}</CardTitle>
                <CardDescription className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {booking.venue?.city}, {booking.venue?.country}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <div className="space-y-1 text-sm">
                  {booking.slot && (
                    <p className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      {formatDateTime(booking.slot.startTime)} – {formatDateTime(booking.slot.endTime)}
                    </p>
                  )}
                  <p className="flex items-center gap-2 text-[var(--color-muted-foreground)]">
                    <Calendar className="h-4 w-4" />
                    Booked {formatDateTime(booking.createdAt)}
                  </p>
                  <span className="inline-block px-2 py-0.5 rounded text-xs bg-[var(--color-accent)] text-[var(--color-accent-foreground)]">
                    {booking.status}
                  </span>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={cancelBooking.isPending}
                  onClick={() => cancelBooking.mutate(booking.id)}
                >
                  Cancel
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
