import { Router } from 'express';
import { z } from 'zod';
import type { Pool } from 'pg';
import type { Env } from '../../config/env.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../lib/response.js';

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});
const unsubscribeSchema = z.object({ endpoint: z.string().url().max(1000) });

/** Match alerts on phones: the public key to subscribe with, and turning alerts on or off per device. */
export function createPushRouter(pool: Pool, env: Env): Router {
  const router = Router();

  router.get('/public-key', (_req, res) => {
    sendSuccess(res, { publicKey: env.VAPID_PUBLIC_KEY ?? null });
  });

  router.post('/subscriptions', authenticate(env), validate(subscriptionSchema), async (req, res, next) => {
    try {
      const { endpoint, keys } = req.body as z.infer<typeof subscriptionSchema>;
      // A device belongs to whoever subscribed it last.
      await pool.query(
        `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (endpoint) DO UPDATE
           SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent`,
        [req.user!.sub, endpoint, keys.p256dh, keys.auth, (req.headers['user-agent'] ?? '').slice(0, 300) || null]
      );
      sendSuccess(res, { subscribed: true }, {}, 201);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/subscriptions', authenticate(env), validate(unsubscribeSchema, 'query'), async (req, res, next) => {
    try {
      await pool.query(`DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2`, [String(req.query.endpoint), req.user!.sub]);
      sendSuccess(res, { subscribed: false });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
