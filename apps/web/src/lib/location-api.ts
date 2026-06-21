import { apiGet } from '@/lib/api';

export interface CountryOption {
  name: string;
  iso2: string;
}

export interface IpLocation {
  country: string;
  city: string;
}

export async function fetchCountries(): Promise<CountryOption[]> {
  return apiGet<CountryOption[]>('/geo/countries');
}

export async function fetchCitiesByCountry(country: string): Promise<string[]> {
  return apiGet<string[]>(`/geo/cities?country=${encodeURIComponent(country)}`);
}

export async function fetchLocationFromIp(): Promise<IpLocation> {
  return apiGet<IpLocation>('/geo/location');
}

export async function fetchLocationFromCoords(lat: number, lng: number): Promise<IpLocation> {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
  });
  return apiGet<IpLocation>(`/geo/reverse?${params.toString()}`);
}

export function matchCityName(city: string, cities: string[]): string | undefined {
  if (!city) return undefined;
  const exact = cities.find((c) => c === city);
  if (exact) return exact;
  const lower = city.toLowerCase();
  return cities.find((c) => c.toLowerCase() === lower);
}

const COUNTRY_ALIASES: Record<string, string> = {
  'united states': 'United States',
  'united states of america': 'United States',
  usa: 'United States',
  uk: 'United Kingdom',
  'great britain': 'United Kingdom',
  uae: 'United Arab Emirates',
};

export function matchCountryName(country: string, countries: string[]): string | undefined {
  if (!country) return undefined;
  const exact = countries.find((c) => c === country);
  if (exact) return exact;
  const lower = country.toLowerCase();
  const caseInsensitive = countries.find((c) => c.toLowerCase() === lower);
  if (caseInsensitive) return caseInsensitive;
  const alias = COUNTRY_ALIASES[lower];
  if (alias) return countries.find((c) => c === alias);
  return undefined;
}
