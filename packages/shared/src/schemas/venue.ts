import { z } from 'zod';

export const createVenueSchema = z.object({
  name: z.string().min(1).max(255),
  address: z.string().min(1),
  city: z.string().min(1).max(100),
  country: z.string().min(1).max(100),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  capacity: z.number().int().min(1).default(10),
  active: z.boolean().optional().default(true),
});

export const venueListQuerySchema = z.object({
  city: z.string().optional(),
  country: z.string().optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export type CreateVenueInput = z.infer<typeof createVenueSchema>;
export type VenueListQuery = z.infer<typeof venueListQuerySchema>;
