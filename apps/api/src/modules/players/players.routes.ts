import { Router } from 'express';
import { timeZoneQuerySchema, updatePlayerSchema, uploadAvatarSchema } from '@vr-tournament/shared';
import type { Pool } from 'pg';
import type { Env } from '../../config/env.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../lib/response.js';
import { PlayersService } from './players.service.js';
import { DrawEntryService } from '../tournaments/draw-entry.service.js';
import { DashboardService } from './dashboard.service.js';

export function createPlayersRouter(pool: Pool, _env: Env): Router {
  const router = Router();
  const service = new PlayersService(pool);
  const entry = new DrawEntryService(pool, _env);
  const dashboard = new DashboardService(pool);

  // Which step of the guided flow the player is on; the web app routes from this.
  router.get('/me/journey', authenticate(_env), async (req, res, next) => {
    try {
      sendSuccess(res, await entry.journey(req.user!.sub));
    } catch (err) {
      next(err);
    }
  });

  // The player's card (same as the headset's): one entry per tournament with what to do next.
  // Dashboard: career stats, recent form, live and open tournaments.
  router.get('/me/dashboard', authenticate(_env), async (req, res, next) => {
    try {
      sendSuccess(res, await dashboard.forPlayer(req.user!.sub));
    } catch (err) {
      next(err);
    }
  });

  router.get('/me/tournaments', authenticate(_env), validate(timeZoneQuerySchema, 'query'), async (req, res, next) => {
    try {
      const { timeZone } = req.query as { timeZone?: string };
      sendSuccess(res, await entry.myTournaments(req.user!.sub, timeZone));
    } catch (err) {
      next(err);
    }
  });

  router.get('/me', authenticate(_env), async (req, res, next) => {
    try {
      const profile = await service.getProfile(req.user!.sub);
      sendSuccess(res, profile);
    } catch (err) {
      next(err);
    }
  });

  router.get('/me/buyback-options', authenticate(_env), async (req, res, next) => {
    try {
      const options = await service.getBuybackOptions(req.user!.sub);
      sendSuccess(res, options);
    } catch (err) {
      next(err);
    }
  });

  router.patch('/me', authenticate(_env), validate(updatePlayerSchema), async (req, res, next) => {
    try {
      const profile = await service.updateProfile(req.user!.sub, req.body);
      sendSuccess(res, profile);
    } catch (err) {
      next(err);
    }
  });

  router.patch('/me/avatar', authenticate(_env), validate(uploadAvatarSchema), async (req, res, next) => {
    try {
      const profile = await service.uploadAvatar(req.user!.sub, req.body);
      sendSuccess(res, profile);
    } catch (err) {
      next(err);
    }
  });

  router.get('/me/avatar', authenticate(_env), async (req, res, next) => {
    try {
      const avatar = await service.getAvatarBuffer(req.user!.sub);
      if (!avatar) {
        res.status(404).end();
        return;
      }
      res.setHeader('Content-Type', avatar.mime);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.send(avatar.buffer);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:username', async (req, res, next) => {
    try {
      const profile = await service.getPublicByUsername(req.params.username as string);
      sendSuccess(res, profile);
    } catch (err) {
      next(err);
    }
  });

  // Public career page: stats, recent innings with 4s/6s, tournament history.
  router.get('/:username/stats', async (req, res, next) => {
    try {
      sendSuccess(res, await dashboard.profile(req.params.username as string));
    } catch (err) {
      next(err);
    }
  });

  router.get('/:username/matches', async (req, res, next) => {
    try {
      const matches = await service.getPublicMatches(req.params.username as string);
      sendSuccess(res, matches);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:username/avatar', async (req, res, next) => {
    try {
      const userId = await service.resolveUserIdByUsername(req.params.username as string);
      if (!userId) {
        res.status(404).end();
        return;
      }
      const avatar = await service.getAvatarBuffer(userId);
      if (!avatar) {
        res.status(404).end();
        return;
      }
      res.setHeader('Content-Type', avatar.mime);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(avatar.buffer);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
