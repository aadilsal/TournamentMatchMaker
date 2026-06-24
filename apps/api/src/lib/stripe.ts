import type { Pool } from 'pg';
import type { Env } from '../config/env.js';
import { AppError } from '../lib/response.js';

let stripeClient: import('stripe').default | null = null;

async function getStripe(env: Env) {
  if (!stripeClient) {
    const Stripe = (await import('stripe')).default;
    stripeClient = new Stripe(env.STRIPE_SECRET_KEY);
  }
  return stripeClient;
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

  const buybackResult = await pool.query(
    `INSERT INTO buybacks (user_id, tournament_id, round_number, match_id, amount_cents, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')
     RETURNING id`,
    [params.userId, params.tournamentId, params.roundNumber, params.matchId, params.amountCents]
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

  await pool.query(
    `UPDATE buybacks SET stripe_payment_intent_id = $1 WHERE id = $2`,
    [intent.id, buybackId]
  );

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
  const buybackRow = await pool.query(
    `SELECT * FROM buybacks WHERE stripe_payment_intent_id = $1`,
    [paymentIntentId]
  );
  const buyback = buybackRow.rows[0];
  if (!buyback) return null;
  if (buyback.status === 'completed') return buyback;

  const { TournamentsService } = await import('../modules/tournaments/tournaments.service.js');
  const service = new TournamentsService(pool, redis, env);
  return service.fulfillBuyback(buyback.id);
}

export async function refundBuybackPayment(env: Env, paymentIntentId: string) {
  const stripe = await getStripe(env);
  return stripe.refunds.create({ payment_intent: paymentIntentId });
}
