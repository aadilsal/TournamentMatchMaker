/** Hardcoded venue geography for legacy snap / seed alignment — not used for geo API lists. */

export const VENUE_LOCATIONS: Record<string, string[]> = {
  Pakistan: ['Lahore', 'Karachi'],
};

/** Reference coordinates for supported venue cities (metro centers). */
export const REFERENCE_CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  Lahore: { lat: 31.5204, lng: 74.3587 },
  Karachi: { lat: 24.8607, lng: 67.0011 },
};

const EARTH_RADIUS_M = 6_371_000;

/** Max distance to snap GPS coords to a supported venue city. */
export const MAX_CITY_SNAP_DISTANCE_M = 500_000;

export function haversineDistanceM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

export function nearestSupportedCity(
  lat: number,
  lng: number
): { country: string; city: string; distanceM: number } | null {
  let best: { country: string; city: string; distanceM: number } | null = null;

  for (const [country, cities] of Object.entries(VENUE_LOCATIONS)) {
    for (const city of cities) {
      const coords = REFERENCE_CITY_COORDS[city];
      if (!coords) continue;
      const distanceM = haversineDistanceM(lat, lng, coords.lat, coords.lng);
      if (!best || distanceM < best.distanceM) {
        best = { country, city, distanceM };
      }
    }
  }

  if (!best || best.distanceM > MAX_CITY_SNAP_DISTANCE_M) return null;
  return best;
}

export const SUPPORTED_COUNTRIES = Object.keys(VENUE_LOCATIONS).sort();

export const ALL_VENUE_CITIES = Object.values(VENUE_LOCATIONS).flat().sort();

export function getCitiesForCountry(country: string): string[] {
  return VENUE_LOCATIONS[country] ?? [];
}

export function normalizeCity(city: string | null | undefined): string {
  return (city ?? '').trim().toLowerCase();
}

export function isSameCity(
  cityA: string | null | undefined,
  cityB: string | null | undefined
): boolean {
  const a = normalizeCity(cityA);
  const b = normalizeCity(cityB);
  if (!a || !b) return false;
  return a === b;
}

/** @deprecated Use /geo/countries API — kept for nearest-city snap helpers only */
export const PROFILE_COUNTRIES = SUPPORTED_COUNTRIES;
