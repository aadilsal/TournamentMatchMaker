import type { Pool } from 'pg';
import type { Env } from '../config/env.js';
import { AppError } from '../lib/response.js';

const SAMPLE_STRIPE_SECRET = 'sk_test_sample_change_me';
const SAMPLE_WEBHOOK_SECRET = 'whsec_sample_change_me';

let stripeClient: import('stripe').default | null = null;

export function isStripeConfigured(env: Env): boolean {
  return (
    !!env.STRIPE_SECRET_KEY &&
    !env.STRIPE_SECRET_KEY.includes('sample') &&
    !!env.STRIPE_WEBHOOK_SECRET &&
    !env.STRIPE_WEBHOOK_SECRET.includes('sample')
  );
}

export function assertStripeConfigured(env: Env): void {
  if (isStripeConfigured(env)) return;
  throw new AppError(
    'SERVICE_UNAVAILABLE',
    'Stripe is not configured — buyback payments are unavailable',
    503
  );
}

async function getStripe(env: Env) {
  assertStripeConfigured(env);
  if (!stripeClient) {
    const Stripe = (await import('stripe')).default;
    stripeClient = new Stripe(env.STRIPE_SECRET_KEY);
  }
  return stripeClient;
}

async function findBuybackByPaymentIntent(pool: Pool, paymentIntentId: string) {
  const buybackRow = await pool.query(`SELECT * FROM buybacks WHERE stripe_payment_intent_id = $1`, [
    paymentIntentId,
  ]);
  return buybackRow.rows[0] ?? null;
}

export async function createBuybackPaymentIntent(
  env: Env,
  pool: Pool,
  params: {
    userId: string;
    tournamentId: string;
    roundNumber: number;
    matchId: string | null;
    amountCents: number;
  }
) {
  const stripe = await getStripe(env);

  const pending = await pool.query(
    `SELECT id, stripe_payment_intent_id, amount_cents
     FROM buybacks
     WHERE user_id = $1 AND tournament_id = $2 AND status = 'pending'
     ORDER BY created_at DESC
     LIMIT 1`,
    [params.userId, params.tournamentId]
  );

  const existing = pending.rows[0];
  if (existing?.stripe_payment_intent_id) {
    const intent = await stripe.paymentIntents.retrieve(existing.stripe_payment_intent_id);
    if (
      intent.client_secret &&
      (intent.status === 'requires_payment_method' ||
        intent.status === 'requires_confirmation' ||
        intent.status === 'requires_action')
    ) {
      return {
        clientSecret: intent.client_secret,
        buybackId: existing.id,
        amountCents: existing.amount_cents,
      };
    }

    await pool.query(`UPDATE buybacks SET status = 'failed' WHERE id = $1 AND status = 'pending'`, [
      existing.id,
    ]);
  }

  const buybackResult = await pool.query(
    `INSERT INTO buybacks (user_id, tournament_id, round_number, match_id, amount_cents, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')
     RETURNING id`,
    [
      params.userId,
      params.tournamentId,
      params.roundNumber,
      params.matchId,
      params.amountCents,
    ]
  );
  const buybackId = buybackResult.rows[0].id;

  const intent = await stripe.paymentIntents.create({
    amount: params.amountCents,
    currency: 'usd',
    metadata: {
      buybackId,
      userId: params.userId,
      tournamentId: params.tournamentId,
    },
    automatic_payment_methods: { enabled: true },
  });

  await pool.query(`UPDATE buybacks SET stripe_payment_intent_id = $1 WHERE id = $2`, [
    intent.id,
    buybackId,
  ]);

  if (!intent.client_secret) {
    throw new AppError('INTERNAL', 'Failed to create payment intent', 500);
  }

  return {
    clientSecret: intent.client_secret,
    buybackId,
    amountCents: params.amountCents,
  };
}

export async function fulfillBuybackFromWebhook(
  pool: Pool,
  redis: import('./redis.js').RedisClient,
  env: Env,
  paymentIntentId: string
) {
  const buyback = await findBuybackByPaymentIntent(pool, paymentIntentId);
  if (!buyback) return null;
  if (buyback.status === 'completed') return buyback;
  if (buyback.status === 'failed') {
    console.warn(`Ignoring payment_intent.succeeded for failed buyback ${buyback.id}`);
    return buyback;
  }
  if (!buyback.stripe_payment_intent_id) {
    throw new AppError('BAD_REQUEST', 'Buyback has no Stripe payment intent', 400);
  }

  const { TournamentsService } = await import('../modules/tournaments/tournaments.service.js');
  const service = new TournamentsService(pool, redis, env);
  return service.fulfillBuyback(buyback.id);
}

export async function failBuybackFromWebhook(pool: Pool, paymentIntentId: string) {
  const buyback = await findBuybackByPaymentIntent(pool, paymentIntentId);
  if (!buyback) return null;
  if (buyback.status === 'completed') return buyback;

  await pool.query(`UPDATE buybacks SET status = 'failed' WHERE id = $1`, [buyback.id]);
  const updated = await pool.query(`SELECT * FROM buybacks WHERE id = $1`, [buyback.id]);
  return updated.rows[0];
}

export async function refundBuybackPayment(env: Env, paymentIntentId: string) {
  const stripe = await getStripe(env);
  return stripe.refunds.create({ payment_intent: paymentIntentId });
}
