import { Router } from 'express';
import { z } from 'zod';
import { getClientIp } from '../../lib/client-ip.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../lib/response.js';
import { GeoService } from './geo.service.js';

const citiesQuerySchema = z.object({
  country: z.string().min(1).max(100),
});

const reverseQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

const coordsQuerySchema = z.object({
  country: z.string().min(1).max(100),
  city: z.string().min(1).max(100),
});

export function createGeoRouter(): Router {
  const router = Router();
  const service = new GeoService();

  router.get('/location', async (req, res, next) => {
    try {
      const location = await service.getLocationFromIp(getClientIp(req));
      sendSuccess(res, location);
    } catch (err) {
      next(err);
    }
  });

  router.get('/reverse', validate(reverseQuerySchema, 'query'), async (req, res, next) => {
    try {
      const { lat, lng } = req.query as unknown as z.infer<typeof reverseQuerySchema>;
      const location = await service.getLocationFromCoords(lat, lng);
      sendSuccess(res, location);
    } catch (err) {
      next(err);
    }
  });

  router.get('/coords', validate(coordsQuerySchema, 'query'), async (req, res, next) => {
    try {
      const { country, city } = req.query as unknown as z.infer<typeof coordsQuerySchema>;
      const coords = await service.geocodeCity(country, city);
      sendSuccess(res, coords);
    } catch (err) {
      next(err);
    }
  });

  router.get('/countries', async (_req, res, next) => {
    try {
      const countries = await service.listCountries();
      sendSuccess(res, countries, { total: countries.length });
    } catch (err) {
      next(err);
    }
  });

  router.get('/cities', validate(citiesQuerySchema, 'query'), async (req, res, next) => {
    try {
      const { country } = req.query as z.infer<typeof citiesQuerySchema>;
      const cities = await service.listCitiesByCountry(country);
      sendSuccess(res, cities, { total: cities.length });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
