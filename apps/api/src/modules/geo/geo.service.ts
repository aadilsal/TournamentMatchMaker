import {
  getCitiesForCountry,
  SUPPORTED_COUNTRIES,
  ALL_VENUE_CITIES,
  normalizeCity,
} from '@vr-tournament/shared';
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

const COUNTRY_ISO: Record<string, string> = {
  Pakistan: 'PK',
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`Request failed (${res.status}): ${url}`);
  return res.json() as Promise<T>;
}

function lookupIp(ip: string | undefined): string | undefined {
  return ip && !isPrivateOrLoopback(ip) ? ip : undefined;
}

function snapToSupported(location: GeoLocation): GeoLocation {
  const country = SUPPORTED_COUNTRIES.find(
    (c) => c.toLowerCase() === location.country.toLowerCase()
  );
  if (!country) return location;

  const cities = getCitiesForCountry(country);
  const cityMatch = cities.find((c) => normalizeCity(c) === normalizeCity(location.city));
  return {
    country,
    city: cityMatch ?? location.city,
  };
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
  async getLocationFromIp(clientIp: string): Promise<GeoLocation> {
    const providers = [tryIpWho, tryIpApiCo, tryIpApiCom];
    for (const provider of providers) {
      try {
        const location = await provider(clientIp);
        if (location) return snapToSupported(location);
      } catch {
        // Try the next provider.
      }
    }
    throw new AppError('GEO_LOOKUP_FAILED', 'Failed to detect location', 503);
  }

  async listCountries(): Promise<CountryOption[]> {
    return SUPPORTED_COUNTRIES.map((name) => ({
      name,
      iso2: COUNTRY_ISO[name] ?? name.slice(0, 2).toUpperCase(),
    }));
  }

  async listCitiesByCountry(country: string): Promise<string[]> {
    const cities = getCitiesForCountry(country);
    if (cities.length === 0) {
      throw new AppError('GEO_CITIES_FAILED', 'Country not supported for venues', 404);
    }
    return cities;
  }

  listVenueCities(): string[] {
    return ALL_VENUE_CITIES;
  }
}
