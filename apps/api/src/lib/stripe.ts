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

    // The player already paid and we simply haven't seen the webhook yet.
    // Treating this as a failure used to mark the paid buyback `failed` and
    // open a second PaymentIntent — a double charge whose original payment the
    // webhook then ignored, because it refuses to fulfil a `failed` buyback.
    if (intent.status === 'succeeded' || intent.status === 'processing') {
      throw new AppError(
        'CONFLICT',
        'Your payment is already going through — give it a moment before trying again',
        409
      );
    }

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
  } else if (existing) {
    // No intent yet: either a concurrent checkout is mid-flight or an earlier one died before Stripe answered.
    const orphaned = await pool.query(
      `UPDATE buybacks SET status = 'failed'
       WHERE id = $1 AND status = 'pending' AND stripe_payment_intent_id IS NULL
         AND created_at < NOW() - INTERVAL '1 minute'
       RETURNING id`,
      [existing.id]
    );
    if (!orphaned.rowCount) throw checkoutInProgress();
  }

  let buybackId: string;
  try {
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
    buybackId = buybackResult.rows[0].id;
  } catch (err) {
    // idx_buybacks_one_pending: a second click landed while the first checkout is open.
    if ((err as { code?: string }).code === '23505') throw checkoutInProgress();
    throw err;
  }

  let intent: import('stripe').Stripe.PaymentIntent;
  try {
    intent = await stripe.paymentIntents.create(
      {
        amount: params.amountCents,
        currency: 'usd',
        metadata: {
          buybackId,
          userId: params.userId,
          tournamentId: params.tournamentId,
        },
        automatic_payment_methods: { enabled: true },
      },
      { idempotencyKey: `buyback-intent:${buybackId}` }
    );
  } catch (err) {
    // A pending row without an intent would block every later checkout.
    await pool.query(`UPDATE buybacks SET status = 'failed' WHERE id = $1 AND status = 'pending'`, [
      buybackId,
    ]);
    throw err;
  }

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
  // A `failed` mark from an earlier decline does not outweigh money that has now arrived.
  if (buyback.status === 'completed' || buyback.refunded_at) return buyback;
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

  await pool.query(`UPDATE buybacks SET status = 'failed' WHERE id = $1 AND status = 'pending'`, [
    buyback.id,
  ]);
  const updated = await pool.query(`SELECT * FROM buybacks WHERE id = $1`, [buyback.id]);
  return updated.rows[0];
}

function checkoutInProgress() {
  return new AppError(
    'CONFLICT',
    'A buyback checkout is already open — finish it or try again in a minute',
    409
  );
}

export async function getPaymentIntentStatus(env: Env, paymentIntentId: string): Promise<string> {
  const stripe = await getStripe(env);
  return (await stripe.paymentIntents.retrieve(paymentIntentId)).status;
}

/** One refund per buyback, however many times it is asked for. */
export async function refundBuybackPayment(env: Env, paymentIntentId: string, buybackId: string) {
  const stripe = await getStripe(env);
  return stripe.refunds.create(
    { payment_intent: paymentIntentId },
    { idempotencyKey: `buyback-refund:${buybackId}` }
  );
}
