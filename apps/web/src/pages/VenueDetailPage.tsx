import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Venue, TimeSlot, Booking } from '@vr-tournament/shared';
import { apiGet, apiPost, getAccessToken } from '@/lib/api';
import { getUserErrorMessage } from '@/lib/user-messages';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SlotPicker, todayString } from '@/components/slots/SlotPicker';
import { MapPin, Users } from 'lucide-react';

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
    onError: (err: Error) => setBookingError(getUserErrorMessage(err)),
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

      {bookingError && (
        <p className="text-sm text-[var(--color-destructive)] mb-4">{bookingError}</p>
      )}

      <SlotPicker
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        slots={slots}
        isLoading={slotsLoading}
        renderSlotAction={(slot, { isFull }) => (
          <Button
            size="sm"
            disabled={isFull || bookSlot.isPending}
            onClick={() => handleBook(slot.id)}
          >
            {isFull ? 'Full' : 'Book'}
          </Button>
        )}
      />
    </div>
  );
}
