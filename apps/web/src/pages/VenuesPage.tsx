import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Venue } from '@vr-tournament/shared';
import { apiGet } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GridSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { MapPin, Users, Navigation } from 'lucide-react';
import { motion } from 'motion/react';

export function VenuesPage() {
  const [searchParams] = useSearchParams();
  const [city, setCity] = useState('');
  const [useGeo, setUseGeo] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const showWelcome = searchParams.get('welcome') === '1';

  useEffect(() => {
    const cityParam = searchParams.get('city');
    const latParam = searchParams.get('lat');
    const lngParam = searchParams.get('lng');
    if (cityParam) setCity(cityParam);
    if (latParam && lngParam) {
      const lat = parseFloat(latParam);
      const lng = parseFloat(lngParam);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        setCoords({ lat, lng });
        setUseGeo(true);
      }
    }
  }, [searchParams]);

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
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/25">
            <MapPin className="h-4.5 w-4.5 text-[var(--color-primary)]" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight">VR Venues</h1>
        </div>
        <p className="text-[var(--color-muted-foreground)] mt-1 ml-11">
          Find certified VR cricket arenas across Canada
        </p>
        {showWelcome && (
          <div className="mt-4 ml-11 rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/8 px-4 py-3 text-sm">
            Join a tournament and we&apos;ll automatically find your opponent.
          </div>
        )}
      </motion.div>

      {/* Search bar */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="flex gap-3 flex-wrap"
      >
        <Input
          placeholder="Filter by city..."
          value={city}
          onChange={(e) => setCity(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && refetch()}
          className="max-w-xs"
        />
        <Button variant="outline" onClick={() => refetch()}>
          Search
        </Button>
        <Button variant="secondary" onClick={handleGeoSearch} className="gap-2">
          <Navigation className="h-4 w-4" />
          Near Me
        </Button>
        {useGeo && coords && (
          <span className="text-sm text-[var(--color-muted-foreground)] self-center">
            Within 50 km
          </span>
        )}
      </motion.div>

      {/* Results */}
      {isLoading ? (
        <GridSkeleton cols={3} count={6} />
      ) : venues.length === 0 ? (
        <EmptyState
          icon={<MapPin className="h-12 w-12" />}
          title="No venues found"
          description="Try a different city or use your location to find nearby arenas."
          action={{ label: 'Clear filter', href: '/venues' }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {venues.map((venue, i) => (
            <motion.div
              key={venue.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: i * 0.04 }}
            >
              <Link to={`/venues/${venue.id}`} className="block h-full group">
                <div className="h-full rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 flex flex-col gap-3 transition-all duration-200 hover:border-[var(--color-primary)]/60 hover:shadow-lg hover:shadow-[var(--color-primary)]/8">
                  <div>
                    <h3 className="font-semibold text-base group-hover:text-[var(--color-primary)] transition-colors">
                      {venue.name}
                    </h3>
                    <p className="text-sm text-[var(--color-muted-foreground)] mt-0.5">
                      {venue.city}, {venue.country}
                    </p>
                  </div>
                  <p className="text-sm text-[var(--color-muted-foreground)] flex-1">{venue.address}</p>
                  <div className="flex items-center justify-between text-sm pt-1 border-t border-[var(--color-border)]">
                    <span className="flex items-center gap-1.5 text-[var(--color-muted-foreground)]">
                      <Users className="h-3.5 w-3.5" />
                      Capacity {venue.capacity}
                    </span>
                    {venue.distanceM !== undefined && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                        {(venue.distanceM / 1000).toFixed(1)} km
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
