import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Venue } from '@vr-tournament/shared';
import { apiGet } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin, Users } from 'lucide-react';

export function VenuesPage() {
  const [city, setCity] = useState('');
  const [useGeo, setUseGeo] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  const { data: venues = [], isLoading, refetch } = useQuery({
    queryKey: ['venues', city, coords],
    queryFn: () => {
      const params = new URLSearchParams();
      if (city) params.set('city', city);
      if (coords) {
        params.set('lat', String(coords.lat));
        params.set('lng', String(coords.lng));
      }
      return apiGet<Venue[]>(`/venues?${params.toString()}`);
    },
  });

  const handleGeoSearch = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setUseGeo(true);
      refetch();
    });
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">VR Venues</h1>
        <p className="text-[var(--color-muted-foreground)]">
          Find tournament venues near you
        </p>
      </div>

      <div className="flex gap-4 mb-6 flex-wrap">
        <Input
          placeholder="Filter by city..."
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="max-w-xs"
        />
        <Button variant="outline" onClick={() => refetch()}>
          Search
        </Button>
        <Button variant="secondary" onClick={handleGeoSearch}>
          <MapPin className="h-4 w-4 mr-2" />
          Near Me
        </Button>
        {useGeo && coords && (
          <span className="text-sm text-[var(--color-muted-foreground)] self-center">
            Showing venues within 50km
          </span>
        )}
      </div>

      {isLoading ? (
        <p>Loading venues...</p>
      ) : venues.length === 0 ? (
        <p className="text-[var(--color-muted-foreground)]">No venues found</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {venues.map((venue) => (
            <Link key={venue.id} to={`/venues/${venue.id}`}>
              <Card className="hover:border-[var(--color-primary)] transition-colors h-full">
                <CardHeader>
                  <CardTitle className="text-lg">{venue.name}</CardTitle>
                  <CardDescription>
                    {venue.city}, {venue.country}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-[var(--color-muted-foreground)] mb-2">{venue.address}</p>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="flex items-center gap-1">
                      <Users className="h-4 w-4" /> Capacity: {venue.capacity}
                    </span>
                    {venue.distanceM !== undefined && (
                      <span>{(venue.distanceM / 1000).toFixed(1)} km away</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
