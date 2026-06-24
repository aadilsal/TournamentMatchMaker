import { normalizeCity } from '@vr-tournament/shared';
import { AppError } from '../../lib/response.js';
import { isPrivateOrLoopback } from '../../lib/client-ip.js';

export interface GeoLocation {
  country: string;
  city: string;
}

export interface CountryOption {
  name: string;
  iso2: string;
}

export interface GeoCoords {
  lat: number;
  lng: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CITIES_CACHE_TTL_MS = 60 * 60 * 1000;
const NOMINATIM_UA = 'VRTournament/1.0 (tournament-matchmaking)';

let countriesCache: { data: CountryOption[]; expires: number } | null = null;
const citiesCache = new Map<string, { data: string[]; expires: number }>();

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`Request failed (${res.status}): ${url}`);
  return res.json() as Promise<T>;
}

function lookupIp(ip: string | undefined): string | undefined {
  return ip && !isPrivateOrLoopback(ip) ? ip : undefined;
}

function matchCountryInList(country: string, countries: CountryOption[]): CountryOption | undefined {
  if (!country) return undefined;
  const exact = countries.find((c) => c.name === country);
  if (exact) return exact;
  const lower = country.toLowerCase();
  return countries.find((c) => c.name.toLowerCase() === lower);
}

function matchCityInList(city: string, cities: string[]): string | undefined {
  if (!city) return undefined;
  const exact = cities.find((c) => c === city);
  if (exact) return exact;
  const norm = normalizeCity(city);
  return cities.find((c) => normalizeCity(c) === norm);
}

async function fetchCountriesFromApi(): Promise<CountryOption[]> {
  const json = await fetchJson<{
    error: boolean;
    data?: Array<{ name: string; Iso2: string }>;
  }>('https://countriesnow.space/api/v0.1/countries/iso');

  if (json.error || !json.data?.length) {
    throw new Error('Countries API returned no data');
  }

  return json.data
    .map((c) => ({ name: c.name, iso2: c.Iso2 }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchCitiesFromApi(country: string): Promise<string[]> {
  const json = await fetchJson<{ error: boolean; data?: string[] }>(
    'https://countriesnow.space/api/v0.1/countries/cities',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country }),
    }
  );

  if (json.error || !json.data?.length) {
    throw new Error(`Cities API failed for ${country}`);
  }

  return [...json.data].sort((a, b) => a.localeCompare(b));
}

async function tryIpWho(ip: string | undefined): Promise<GeoLocation | null> {
  const url = lookupIp(ip) ? `https://ipwho.is/${lookupIp(ip)}` : 'https://ipwho.is/';
  const json = await fetchJson<{ success: boolean; country?: string; city?: string }>(url);
  if (!json.success || !json.country) return null;
  return { country: json.country, city: json.city || '' };
}

async function tryIpApiCo(ip: string | undefined): Promise<GeoLocation | null> {
  const url = lookupIp(ip) ? `https://ipapi.co/${lookupIp(ip)}/json/` : 'https://ipapi.co/json/';
  const json = await fetchJson<{ country_name?: string; city?: string; error?: boolean }>(url);
  if (json.error || !json.country_name) return null;
  return { country: json.country_name, city: json.city || '' };
}

async function tryIpApiCom(ip: string | undefined): Promise<GeoLocation | null> {
  const target = lookupIp(ip);
  const url = target
    ? `http://ip-api.com/json/${target}?fields=status,country,city`
    : 'http://ip-api.com/json/?fields=status,country,city';
  const json = await fetchJson<{ status: string; country?: string; city?: string }>(url);
  if (json.status !== 'success' || !json.country) return null;
  return { country: json.country, city: json.city || '' };
}

export class GeoService {
  async listCountries(): Promise<CountryOption[]> {
    const now = Date.now();
    if (countriesCache && countriesCache.expires > now) {
      return countriesCache.data;
    }

    const data = await fetchCountriesFromApi();
    countriesCache = { data, expires: now + CACHE_TTL_MS };
    return data;
  }

  async listCitiesByCountry(country: string): Promise<string[]> {
    const countries = await this.listCountries();
    const matched = matchCountryInList(country, countries);
    if (!matched) {
      throw new AppError('GEO_CITIES_FAILED', 'Country not found', 404);
    }

    const cacheKey = matched.name;
    const now = Date.now();
    const cached = citiesCache.get(cacheKey);
    if (cached && cached.expires > now) {
      return cached.data;
    }

    const data = await fetchCitiesFromApi(matched.name);
    citiesCache.set(cacheKey, { data, expires: now + CITIES_CACHE_TTL_MS });
    return data;
  }

  async geocodeCity(country: string, city: string): Promise<GeoCoords> {
    const countries = await this.listCountries();
    const matched = matchCountryInList(country, countries);
    if (!matched) {
      throw new AppError('GEO_COORDS_NOT_FOUND', 'Country not found', 404);
    }

    const json = await fetchJson<{
      results?: Array<{
        name: string;
        latitude: number;
        longitude: number;
        country_code?: string;
      }>;
    }>(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=25&language=en&format=json`
    );

    const results = json.results ?? [];
    const iso = matched.iso2.toUpperCase();

    const exact = results.find(
      (r) =>
        r.country_code?.toUpperCase() === iso &&
        normalizeCity(r.name) === normalizeCity(city)
    );
    if (exact) return { lat: exact.latitude, lng: exact.longitude };

    const inCountry = results.find((r) => r.country_code?.toUpperCase() === iso);
    if (inCountry) return { lat: inCountry.latitude, lng: inCountry.longitude };

    if (results[0]) {
      return { lat: results[0].latitude, lng: results[0].longitude };
    }

    throw new AppError('GEO_COORDS_NOT_FOUND', 'Could not resolve coordinates for this city', 404);
  }

  async getLocationFromCoords(lat: number, lng: number): Promise<GeoLocation> {
    const json = await fetchJson<{
      address?: {
        country?: string;
        city?: string;
        town?: string;
        village?: string;
        municipality?: string;
      };
    }>(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      {
        headers: { 'User-Agent': NOMINATIM_UA },
      }
    );

    const country = json.address?.country;
    if (!country) {
      throw new AppError('GEO_OUT_OF_RANGE', 'Could not resolve location from coordinates', 404);
    }

    const city =
      json.address?.city ||
      json.address?.town ||
      json.address?.village ||
      json.address?.municipality ||
      '';

    const countries = await this.listCountries();
    const matchedCountry = matchCountryInList(country, countries);
    if (!matchedCountry) {
      return { country, city };
    }

    if (!city) {
      return { country: matchedCountry.name, city: '' };
    }

    try {
      const cities = await this.listCitiesByCountry(matchedCountry.name);
      const matchedCity = matchCityInList(city, cities);
      return { country: matchedCountry.name, city: matchedCity ?? city };
    } catch {
      return { country: matchedCountry.name, city };
    }
  }

  async getLocationFromIp(clientIp: string): Promise<GeoLocation> {
    const providers = [tryIpWho, tryIpApiCo, tryIpApiCom];
    let raw: GeoLocation | null = null;

    for (const provider of providers) {
      try {
        raw = await provider(clientIp);
        if (raw) break;
      } catch {
        // Try the next provider.
      }
    }

    if (!raw) {
      throw new AppError('GEO_LOOKUP_FAILED', 'Failed to detect location', 503);
    }

    const countries = await this.listCountries();
    const matchedCountry = matchCountryInList(raw.country, countries);
    if (!matchedCountry) {
      return { country: raw.country, city: raw.city };
    }

    if (!raw.city) {
      return { country: matchedCountry.name, city: '' };
    }

    try {
      const cities = await this.listCitiesByCountry(matchedCountry.name);
      const matchedCity = matchCityInList(raw.city, cities);
      return { country: matchedCountry.name, city: matchedCity ?? '' };
    } catch {
      return { country: matchedCountry.name, city: raw.city };
    }
  }
}
