import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { GeoService } from '../modules/geo/geo.service.js';

// "Use my location" falls back to the IP lookup when the map service fails, and never logs the coordinates.

type Reply = { ok: boolean; status: number; body?: unknown };
const realFetch = global.fetch;

function stubFetch(route: (url: string) => Reply) {
  global.fetch = jest.fn(async (input: unknown) => {
    const r = route(String(input));
    return { ok: r.ok, status: r.status, json: async () => r.body } as Response;
  }) as typeof fetch;
}

const countries: Reply = { ok: true, status: 200, body: { error: false, data: [{ name: 'Pakistan', Iso2: 'PK' }] } };
const cities: Reply = { ok: true, status: 200, body: { error: false, data: ['Karachi', 'Lahore'] } };
const down: Reply = { ok: false, status: 503 };

afterEach(() => {
  global.fetch = realFetch;
  jest.restoreAllMocks();
});

describe('reverse geocoding with IP fallback', () => {
  it('uses GPS when the map service answers', async () => {
    stubFetch((url) =>
      url.includes('nominatim') ? { ok: true, status: 200, body: { address: { country: 'Pakistan', city: 'Lahore' } } }
      : url.includes('countries/iso') ? countries : url.includes('countries/cities') ? cities : down
    );
    await expect(new GeoService().getLocationFromCoordsOrIp(31.5, 74.3, '203.0.113.9')).resolves.toEqual({
      country: 'Pakistan', city: 'Lahore', source: 'gps',
    });
  });

  it('falls back to the IP location when the map service is busy, without logging coordinates', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    stubFetch((url) =>
      url.includes('nominatim') ? down
      : url.includes('ipwho.is') ? { ok: true, status: 200, body: { success: true, country: 'Pakistan', city: 'Lahore' } }
      : url.includes('countries/iso') ? countries : url.includes('countries/cities') ? cities : down
    );
    await expect(new GeoService().getLocationFromCoordsOrIp(31.501303, 74.335679, '203.0.113.9')).resolves.toEqual({
      country: 'Pakistan', city: 'Lahore', source: 'ip',
    });
    expect(warn.mock.calls.flat().join(' ')).not.toMatch(/31\.50|74\.33/);
  });

  it('asks the player to pick manually when both lookups fail', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    stubFetch(() => down);
    await expect(new GeoService().getLocationFromCoordsOrIp(31.5, 74.3, '203.0.113.9')).rejects.toMatchObject({
      code: 'GEO_LOOKUP_FAILED',
      status: 503,
    });
  });
});
