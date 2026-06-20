import { Link, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Venue } from '@vr-tournament/shared';
import { apiGet } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ArrowRight, CheckCircle2, Headset, MapPin, Target } from 'lucide-react';
import { motion } from 'motion/react';

interface WelcomeState {
  hasVrHeadset?: boolean;
  city?: string;
  latitude?: number;
  longitude?: number;
  returnTo?: string;
}

export function WelcomePage() {
  const location = useLocation();
  const navigate = useNavigate();
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
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="rounded-xl border border-[var(--color-primary)]/30 bg-[var(--color-card)] overflow-hidden"
      >
        {/* Top accent */}
        <div className="h-1.5 bg-gradient-to-r from-[var(--color-primary)] via-emerald-500 to-[var(--color-primary)]" />

        <div className="p-6 sm:p-8">
          {/* Hero row */}
          <div className="flex items-start justify-between gap-6 mb-8">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">You&apos;re in!</h1>
              <p className="text-[var(--color-muted-foreground)] mt-1">
                Your profile is ready. Here&apos;s how to get to your first match.
              </p>
            </div>
            <img
              src="/images/cricket-player-3d.png"
              alt="VR cricket player"
              className="h-24 w-24 object-contain shrink-0 opacity-90"
            />
          </div>

          <ol className="space-y-5">
            {/* Step 1 */}
            <li className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
                <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400" />
              </span>
              <div className="pt-0.5">
                <p className="font-medium">Account created</p>
                <p className="text-sm text-[var(--color-muted-foreground)] mt-0.5">
                  You can update your profile anytime from settings.
                </p>
              </div>
            </li>

            {/* Step 2 — venue or headset */}
            {!hasVrHeadset ? (
              <li className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/20">
                  <MapPin className="h-4 w-4 text-[var(--color-primary)]" />
                </span>
                <div className="flex-1 space-y-3 pt-0.5">
                  <div>
                    <p className="font-medium">Book a nearby arena</p>
                    <p className="text-sm text-[var(--color-muted-foreground)] mt-0.5">
                      Without a Meta Quest headset, we match you at the closest shared VR venue.
                    </p>
                  </div>
                  {nearbyVenues.length > 0 && (
                    <ul className="space-y-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/20 p-3">
                      {nearbyVenues.map((venue) => (
                        <li key={venue.id} className="text-sm">
                          <Link
                            to={`/venues/${venue.id}`}
                            className="font-medium text-[var(--color-primary)] hover:underline"
                          >
                            {venue.name}
                          </Link>
                          <span className="text-[var(--color-muted-foreground)]">
                            {' '}— {venue.city}
                            {venue.distanceM != null && ` (${(venue.distanceM / 1000).toFixed(1)} km)`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link to={venueLink}>
                    <Button variant="outline" size="sm" className="gap-2">
                      Browse venues <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </div>
              </li>
            ) : (
              <li className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/20">
                  <Headset className="h-4 w-4 text-[var(--color-primary)]" />
                </span>
                <div className="pt-0.5">
                  <p className="font-medium">Meta Quest ready</p>
                  <p className="text-sm text-[var(--color-muted-foreground)] mt-0.5">
                    You can queue for remote matches — no venue booking required.
                  </p>
                </div>
              </li>
            )}

            {/* Step 3 */}
            <li className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/20">
                <Target className="h-4 w-4 text-[var(--color-primary)]" />
              </span>
              <div className="pt-0.5">
                <p className="font-medium">Enter a tournament</p>
                <p className="text-sm text-[var(--color-muted-foreground)] mt-0.5">
                  Pick a tournament and we&apos;ll automatically find your opponent — no manual queue needed.
                </p>
              </div>
            </li>
          </ol>

          <div className="flex flex-col sm:flex-row gap-3 pt-6 mt-6 border-t border-[var(--color-border)]">
            <Button
              className="w-full gap-2 flex-1"
              size="lg"
              onClick={() => navigate(state?.returnTo ?? '/tournaments')}
            >
              Choose a tournament <ArrowRight className="h-4 w-4" />
            </Button>
            <Link to="/profile" className="flex-1">
              <Button variant="outline" className="w-full" size="lg">
                View profile
              </Button>
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
