/** Hardcoded venue geography — aligned with seeded venues in packages/db/seeds/dev.ts */

export const VENUE_LOCATIONS: Record<string, string[]> = {
  Pakistan: ['Lahore', 'Karachi'],
};

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

/** Countries for user profile registration (broader than venue-only list) */
export const PROFILE_COUNTRIES = SUPPORTED_COUNTRIES;
