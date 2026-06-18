import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import type { Pool } from 'pg';
import type { RedisClient } from './lib/redis.js';
import type { Env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { publicRateLimit, authRateLimit } from './middleware/rateLimit.js';
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
import { sendSuccess } from './lib/response.js';

export function createApp(pool: Pool, redis: RedisClient, env: Env): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(pinoHttp({ level: env.NODE_ENV === 'production' ? 'info' : 'debug' }));

  app.get('/health', (_req, res) => {
    sendSuccess(res, { status: 'ok', timestamp: new Date().toISOString() });
  });

  const v1 = express.Router();
  v1.use(publicRateLimit(env));

  v1.use('/geo', createGeoRouter());
  v1.use('/auth', createAuthRouter(pool, redis, env));
  v1.use('/players', authRateLimit(env), createPlayersRouter(pool, env));
  v1.use('/venues', createVenuesRouter(pool, redis, env));
  v1.use('/venues/:id/slots', createSlotsRouter(pool, env));
  v1.use('/bookings', authRateLimit(env), createBookingsRouter(pool, redis, env));
  v1.use('/tournaments', createTournamentsRouter(pool, redis, env));
  v1.use('/matchmaking', authRateLimit(env), createMatchmakingRouter(pool, redis, env));
  v1.use('/matches', authRateLimit(env), createMatchesRouter(pool, redis, env));
  v1.use('/notifications', authRateLimit(env), createNotificationsRouter(pool, env));

  app.use('/api/v1', v1);
  app.use(errorHandler);

  return app;
}
