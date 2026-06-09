import { Link, useLocation, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Venue } from '@vr-tournament/shared';
import { apiGet } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, Headset, MapPin, Swords } from 'lucide-react';

interface WelcomeState {
  hasVrHeadset?: boolean;
  city?: string;
  latitude?: number;
  longitude?: number;
}

export function WelcomePage() {
  const location = useLocation();
  const state = (location.state as WelcomeState | null) ?? null;

  if (!state) {
    return <Navigate to="/profile" replace />;
  }

  const { hasVrHeadset, city, latitude, longitude } = state;
  const hasCoords = latitude !== undefined && longitude !== undefined;

  const { data: nearbyVenues = [] } = useQuery({
    queryKey: ['welcome-venues', latitude, longitude, city],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '3' });
      if (hasCoords) {
        params.set('lat', String(latitude));
        params.set('lng', String(longitude));
      } else if (city) {
        params.set('city', city);
      }
      return apiGet<Venue[]>(`/venues?${params.toString()}`);
    },
    enabled: !hasVrHeadset && (!!hasCoords || !!city),
  });

  const venueLink = (() => {
    const params = new URLSearchParams();
    if (city) params.set('city', city);
    if (hasCoords) {
      params.set('lat', String(latitude));
      params.set('lng', String(longitude));
    }
    const qs = params.toString();
    return qs ? `/venues?${qs}` : '/venues';
  })();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card className="border-[var(--color-primary)]/30">
        <CardHeader>
          <CardTitle className="text-2xl">You&apos;re in!</CardTitle>
          <CardDescription>
            Your profile is ready. Here&apos;s how to get to your first match.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ol className="space-y-4">
            <li className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-sm font-semibold text-emerald-400">
                ✓
              </span>
              <div>
                <p className="font-medium">Account created</p>
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  You can update your profile anytime from settings.
                </p>
              </div>
            </li>

            {!hasVrHeadset && (
              <li className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/20 text-[var(--color-primary)]">
                  <MapPin className="h-4 w-4" />
                </span>
                <div className="flex-1 space-y-3">
                  <div>
                    <p className="font-medium">Book a nearby arena</p>
                    <p className="text-sm text-[var(--color-muted-foreground)]">
                      Without a Meta Quest headset, we match you at the closest shared VR venue.
                    </p>
                  </div>
                  {nearbyVenues.length > 0 && (
                    <ul className="space-y-2 rounded-lg border border-[var(--color-border)] p-3">
                      {nearbyVenues.map((venue) => (
                        <li key={venue.id} className="text-sm">
                          <Link
                            to={`/venues/${venue.id}`}
                            className="font-medium text-[var(--color-primary)] hover:underline"
                          >
                            {venue.name}
                          </Link>
                          <span className="text-[var(--color-muted-foreground)]">
                            {' '}
                            — {venue.city}
                            {venue.distanceM != null && ` (${(venue.distanceM / 1000).toFixed(1)} km)`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link to={venueLink}>
                    <Button variant="outline" size="sm" className="gap-2">
                      Browse venues
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </div>
              </li>
            )}

            {hasVrHeadset && (
              <li className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/20 text-[var(--color-primary)]">
                  <Headset className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-medium">Meta Quest ready</p>
                  <p className="text-sm text-[var(--color-muted-foreground)]">
                    You can queue for remote matches — no venue booking required.
                  </p>
                </div>
              </li>
            )}

            <li className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/20 text-[var(--color-primary)]">
                <Swords className="h-4 w-4" />
              </span>
              <div>
                <p className="font-medium">Enter the queue</p>
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  Tekken-style random matchmaking pairs you with the next available opponent.
                </p>
              </div>
            </li>
          </ol>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Link to="/matchmaking" className="flex-1">
              <Button className="w-full gap-2" size="lg">
                Join matchmaking
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/tournaments" className="flex-1">
              <Button variant="outline" className="w-full" size="lg">
                Browse tournaments
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
