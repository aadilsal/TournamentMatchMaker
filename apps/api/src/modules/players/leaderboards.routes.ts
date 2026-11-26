import { Router } from 'express';
import type { Pool } from 'pg';
import { sendSuccess } from '../../lib/response.js';
import { DashboardService } from './dashboard.service.js';

/** Public all-time leaderboards: most 6s, 4s and runs, fewest wickets lost, highest innings, top rated. */
export function createLeaderboardsRouter(pool: Pool): Router {
  const router = Router();
  const service = new DashboardService(pool);
  router.get('/', async (_req, res, next) => {
    try {
      sendSuccess(res, await service.leaderboards());
    } catch (err) {
      next(err);
    }
  });
  return router;
}
