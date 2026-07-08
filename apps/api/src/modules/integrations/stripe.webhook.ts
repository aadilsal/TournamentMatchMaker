import { Router, raw } from 'express';
import type { Pool } from 'pg';
import type { Env } from '../../config/env.js';
import type { RedisClient } from '../../lib/redis.js';
import {
  assertStripeConfigured,
  failBuybackFromWebhook,
  fulfillBuybackFromWebhook,
} from '../../lib/stripe.js';

export function createStripeWebhookRouter(pool: Pool, redis: RedisClient, env: Env): Router {
  const router = Router();

  router.post('/', raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'] as string | undefined;
    if (!sig) {
      res.status(400).send('Missing stripe-signature');
      return;
    }

    try {
      assertStripeConfigured(env);
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(env.STRIPE_SECRET_KEY);
      const event = stripe.webhooks.constructEvent(req.body, sig, env.STRIPE_WEBHOOK_SECRET);

      if (event.type === 'payment_intent.succeeded') {
        const pi = event.data.object;
        await fulfillBuybackFromWebhook(pool, redis, env, pi.id);
      }

      if (event.type === 'payment_intent.payment_failed') {
        const pi = event.data.object;
        await failBuybackFromWebhook(pool, pi.id);
      }

      res.json({ received: true });
    } catch (err) {
      console.error('Stripe webhook error:', err);
      res.status(400).send(`Webhook Error: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  });

  return router;
}
