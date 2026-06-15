import { AppError } from '../../lib/response.js';
import { isPrivateOrLoopback } from '../../lib/client-ip.js';

const COUNTRIES_NOW_BASE = 'https://countriesnow.space/api/v0.1';

interface CountriesNowResponse<T> {
  error: boolean;
  msg: string;
  data: T;
}

export interface GeoLocation {
  country: string;
  city: string;
}

export interface CountryOption {
  name: string;
  iso2: string;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`Request failed (${res.status}): ${url}`);
  return res.json() as Promise<T>;
}

function lookupIp(ip: string | undefined): string | undefined {
  return ip && !isPrivateOrLoopback(ip) ? ip : undefined;
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
        if (location) return location;
      } catch {
        // Try the next provider.
      }
    }
    throw new AppError('GEO_LOOKUP_FAILED', 'Failed to detect location', 503);
  }

  async listCountries(): Promise<CountryOption[]> {
    const json = await fetchJson<CountriesNowResponse<{ name: string; Iso2: string }[]>>(
      `${COUNTRIES_NOW_BASE}/countries/iso`
    );
    if (json.error) {
      throw new AppError('GEO_COUNTRIES_FAILED', json.msg || 'Failed to load countries', 503);
    }
    return json.data
      .map((country) => ({ name: country.name, iso2: country.Iso2 }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async listCitiesByCountry(country: string): Promise<string[]> {
    const json = await fetchJson<CountriesNowResponse<string[]>>(
      `${COUNTRIES_NOW_BASE}/countries/cities`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country }),
      }
    );
    if (json.error) {
      throw new AppError('GEO_CITIES_FAILED', json.msg || 'Failed to load cities', 503);
    }
    return json.data.sort((a, b) => a.localeCompare(b));
  }
}
