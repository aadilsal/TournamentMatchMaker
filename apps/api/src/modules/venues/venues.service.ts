import type { Pool } from 'pg';
import type { RedisClient } from '../../lib/redis.js';
import type { CreateVenueInput, VenueListQuery } from '@vr-tournament/shared';
import { mapVenue } from '../../lib/mappers.js';
import { AppError } from '../../lib/response.js';

const GEO_CACHE_TTL = 300;

export class VenuesService {
  constructor(
    private pool: Pool,
    private redis: RedisClient
  ) {}

  async list(query: VenueListQuery) {
    const { city, country, lat, lng, limit } = query;

    if (lat !== undefined && lng !== undefined) {
      const cacheKey = `venues:geo:${lat.toFixed(4)}:${lng.toFixed(4)}:${limit}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const result = await this.pool.query(
        `SELECT v.id, v.name, v.address, v.city, v.country, v.capacity, v.active,
                v.created_at, v.updated_at,
                ST_Y(v.location) AS latitude,
                ST_X(v.location) AS longitude,
                ST_Distance(v.location::geography,
                  ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS dist_m
         FROM venues v
         WHERE v.active = TRUE
           AND ST_DWithin(v.location::geography,
             ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 50000)
         ORDER BY dist_m
         LIMIT $3`,
        [lng, lat, limit]
      );

      const venues = result.rows.map(mapVenue);
      await this.redis.setex(cacheKey, GEO_CACHE_TTL, JSON.stringify(venues));
      return venues;
    }

    const conditions = ['active = TRUE'];
    const params: unknown[] = [];
    let idx = 1;

    if (city) {
      conditions.push(`city ILIKE $${idx++}`);
      params.push(city);
    }
    if (country) {
      conditions.push(`country ILIKE $${idx++}`);
      params.push(country);
    }
    params.push(limit);

    const result = await this.pool.query(
      `SELECT id, name, address, city, country, capacity, active, created_at, updated_at,
              ST_Y(location) AS latitude, ST_X(location) AS longitude
       FROM venues
       WHERE ${conditions.join(' AND ')}
       ORDER BY name
       LIMIT $${idx}`,
      params
    );

    return result.rows.map(mapVenue);
  }

  async getById(id: string) {
    const result = await this.pool.query(
      `SELECT id, name, address, city, country, capacity, active, created_at, updated_at,
              ST_Y(location) AS latitude, ST_X(location) AS longitude
       FROM venues WHERE id = $1`,
      [id]
    );

    if (!result.rows[0]) {
      throw new AppError('NOT_FOUND', 'Venue not found', 404);
    }

    return mapVenue(result.rows[0]);
  }

  async create(input: CreateVenueInput) {
    const result = await this.pool.query(
      `INSERT INTO venues (name, address, city, country, location, capacity, active)
       VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326), $7, $8)
       RETURNING id, name, address, city, country, capacity, active, created_at, updated_at,
                 ST_Y(location) AS latitude, ST_X(location) AS longitude`,
      [
        input.name,
        input.address,
        input.city,
        input.country,
        input.longitude,
        input.latitude,
        input.capacity,
        input.active,
      ]
    );

    return mapVenue(result.rows[0]);
  }
}
