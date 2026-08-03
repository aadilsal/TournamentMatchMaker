import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import type { Pool } from 'pg';
import type { RedisClient } from './lib/redis.js';
import type { Env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { publicRateLimit, scopedRateLimit } from './middleware/rateLimit.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createPlayersRouter } from './modules/players/players.routes.js';
import { createVenuesRouter } from './modules/venues/venues.routes.js';
import { createSlotsRouter } from './modules/slots/slots.routes.js';
import { createBookingsRouter } from './modules/bookings/bookings.routes.js';
import { createTournamentsRouter } from './modules/tournaments/tournaments.routes.js';
import { createMatchmakingRouter } from './modules/matchmaking/matchmaking.routes.js';
import { createMatchesRouter } from './modules/matches/matches.routes.js';
import { createNotificationsRouter } from './modules/notifications/notifications.routes.js';
import { createGeoRouter } from './modules/geo/geo.routes.js';
import { createMetaIntegrationRouter } from './modules/integrations/meta.routes.js';
import { createStripeWebhookRouter } from './modules/integrations/stripe.webhook.js';
import { createAdminRouter } from './modules/admin/admin.routes.js';
import { sendSuccess } from './lib/response.js';

export function createApp(pool: Pool, redis: RedisClient, env: Env): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.use(
    helmet({
      // API (:3000) serves images to the SPA (:5173) — allow cross-origin embedding.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use('/webhooks/stripe', createStripeWebhookRouter(pool, redis, env));
  // Default 100kb is too small for base64 avatar uploads (schema allows up to ~2MB decoded).
  app.use(express.json({ limit: '4mb' }));
  app.use(cookieParser());
  app.use(pinoHttp({ level: env.NODE_ENV === 'production' ? 'info' : 'debug' }));

  app.get('/health', (_req, res) => {
    sendSuccess(res, { status: 'ok', timestamp: new Date().toISOString() });
  });

  const v1 = express.Router();

  // Mounted ahead of publicRateLimit: VR headsets poll far above any per-IP
  // public budget and share a venue's public IP. The Meta router applies its own
  // per-player limits instead.
  v1.use('/integrations/meta', createMetaIntegrationRouter(pool, redis, env));

  // Anonymous browsing only — signed-in traffic is metered per user, per feature
  // by scopedRateLimit below so that doing several things at once (polling
  // matches while booking a slot while searching for an opponent) never spends
  // one feature's budget on another.
  v1.use(publicRateLimit(env));

  v1.use('/geo', createGeoRouter());
  v1.use('/auth', createAuthRouter(pool, redis, env));
  v1.use('/players', scopedRateLimit(env, 'players'), createPlayersRouter(pool, env));
  v1.use('/venues', scopedRateLimit(env, 'venues', { read: 600 }), createVenuesRouter(pool, redis, env));
  v1.use('/venues/:id/slots', scopedRateLimit(env, 'slots', { read: 600 }), createSlotsRouter(pool, env));
  v1.use('/bookings', scopedRateLimit(env, 'bookings'), createBookingsRouter(pool, redis, env));
  v1.use(
    '/tournaments',
    scopedRateLimit(env, 'tournaments', { read: 600 }),
    createTournamentsRouter(pool, redis, env)
  );
  v1.use('/matchmaking', scopedRateLimit(env, 'matchmaking'), createMatchmakingRouter(pool, redis, env));
  v1.use('/matches', scopedRateLimit(env, 'matches', { read: 600 }), createMatchesRouter(pool, redis, env));
  v1.use(
    '/notifications',
    scopedRateLimit(env, 'notifications', { read: 600 }),
    createNotificationsRouter(pool, env)
  );
  v1.use('/admin', scopedRateLimit(env, 'admin', { read: 900, write: 300 }), createAdminRouter(pool, redis, env));

  app.use('/api/v1', v1);
  app.use(errorHandler);

  return app;
}
