import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Venue, TimeSlot, Booking } from '@vr-tournament/shared';
import { apiGet, apiPost, getAccessToken } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin, Users, Clock } from 'lucide-react';

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function todayString() {
  return new Date().toISOString().split('T')[0];
}

export function VenueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(todayString());
  const [bookingError, setBookingError] = useState('');

  const { data: venue, isLoading: venueLoading } = useQuery({
    queryKey: ['venue', id],
    queryFn: () => apiGet<Venue>(`/venues/${id}`),
    enabled: !!id,
  });

  const { data: slots = [], isLoading: slotsLoading } = useQuery({
    queryKey: ['slots', id, selectedDate],
    queryFn: () => apiGet<TimeSlot[]>(`/venues/${id}/slots?date=${selectedDate}`),
    enabled: !!id,
  });

  const bookSlot = useMutation({
    mutationFn: (timeSlotId: string) => apiPost<Booking>('/bookings', { timeSlotId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['slots', id, selectedDate] });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      navigate('/bookings');
    },
    onError: (err: Error) => setBookingError(err.message),
  });

  const handleBook = (slotId: string) => {
    if (!getAccessToken()) {
      navigate('/login');
      return;
    }
    setBookingError('');
    bookSlot.mutate(slotId);
  };

  if (venueLoading) return <p>Loading venue...</p>;
  if (!venue) return <p>Venue not found</p>;

  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d.toISOString().split('T')[0];
  });

  return (
    <div className="max-w-3xl mx-auto">
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-2xl">{venue.name}</CardTitle>
          <CardDescription className="flex items-center gap-1">
            <MapPin className="h-4 w-4" />
            {venue.address}, {venue.city}, {venue.country}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4" />
            Capacity: {venue.capacity} players
          </div>
        </CardContent>
      </Card>

      <h2 className="text-xl font-semibold mb-4">Available Time Slots</h2>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {dates.map((date) => (
          <Button
            key={date}
            variant={selectedDate === date ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedDate(date)}
          >
            {new Date(date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
          </Button>
        ))}
      </div>

      {bookingError && (
        <p className="text-sm text-[var(--color-destructive)] mb-4">{bookingError}</p>
      )}

      {slotsLoading ? (
        <p>Loading slots...</p>
      ) : slots.length === 0 ? (
        <p className="text-[var(--color-muted-foreground)]">No slots available for this date</p>
      ) : (
        <div className="grid gap-3">
          {slots.map((slot) => {
            const available = slot.maxCapacity - slot.bookedCount;
            const isFull = slot.status === 'full' || available <= 0;

            return (
              <Card key={slot.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-3">
                    <Clock className="h-5 w-5 text-[var(--color-primary)]" />
                    <div>
                      <p className="font-medium">
                        {formatTime(slot.startTime)} – {formatTime(slot.endTime)}
                      </p>
                      <p className="text-sm text-[var(--color-muted-foreground)]">
                        {available} of {slot.maxCapacity} spots left
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    disabled={isFull || bookSlot.isPending}
                    onClick={() => handleBook(slot.id)}
                  >
                    {isFull ? 'Full' : 'Book'}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
