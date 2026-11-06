import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import pg from 'pg';
import { Redis } from 'ioredis';
import request from 'supertest';
import { readFileSync, readdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import type { Env } from '../config/env.js';
import { RATING_WIN_POINTS, ROUND_PLAY_STARTS_AT_SQL, matchNotificationDetails } from '@vr-tournament/shared';

// Pre-launch QA regressions (C1, C6, H2, H4, H10, H11, M12, M14, Meta live tournaments).

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../../.env'), override: true });

const stripeCalls = {
  refunds: [] as Array<{ params: unknown; opts: unknown }>,
  intentStatus: 'succeeded',
};
jest.unstable_mockModule('stripe', () => ({
  default: class {
    paymentIntents = {
      create: async () => ({ id: `pi_${Math.random().toString(36).slice(2)}`, client_secret: 'cs_test' }),
      retrieve: async () => ({ status: stripeCalls.intentStatus, client_secret: 'cs_test' }),
    };
    refunds = {
      create: async (params: unknown, opts: unknown) => {
        stripeCalls.refunds.push({ params, opts });
        return { id: 're_test' };
      },
    };
  },
}));

// Own database: integration.test.ts drops tables in the shared test DB and jest runs files in parallel.
function testDbUrl(): string {
  const raw = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!raw) throw new Error('TEST_DATABASE_URL must be set');
  const url = new URL(raw);
  const name = url.pathname.slice(1).replace(/_test$/, '');
  url.pathname = `/${name}_fixes_test`;
  return url.toString();
}
const DB_URL = testDbUrl();
// Separate Redis DB so the dev worker never picks up jobs these tests enqueue.
const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
redisUrl.pathname = '/5';

const env = {
  NODE_ENV: 'test',
  PORT: 3000,
  DATABASE_URL: DB_URL,
  REDIS_URL: redisUrl.toString(),
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  JWT_REFRESH_SECRET: 'y'.repeat(32),
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '7d',
  CORS_ORIGIN: 'http://localhost:5173',
  RESEND_FROM_EMAIL: 'notifications@vrtournament.com',
  NOTIFICATION_EMAIL_ENABLED: true,
  APP_URL: 'http://localhost:5173',
  META_API_KEY: 'qa-fixes-meta-key-123456',
  STRIPE_SECRET_KEY: 'sk_test_qafixes',
  STRIPE_WEBHOOK_SECRET: 'whsec_qafixes',
  AWS_ACCESS_KEY_ID: 'sample-aws-access-key',
  AWS_SECRET_ACCESS_KEY: 'sample-aws-secret-key',
  AWS_REGION: 'us-east-1',
  AWS_SES_FROM_EMAIL: 'notifications@pixelpaddle.com',
} as unknown as Env;

async function resetDatabase() {
  const url = new URL(DB_URL);
  const dbName = url.pathname.slice(1);
  url.pathname = '/postgres';
  const admin = new pg.Pool({ connectionString: url.toString() });
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (!exists.rows[0]) await admin.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.end();
  }
  const db = new pg.Pool({ connectionString: DB_URL });
  try {
    await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    const dir = join(__dirname, '../../../../packages/db/migrations');
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      const up = readFileSync(join(dir, file), 'utf-8')
        .split(/^-- (?:Down Migration|migrate:down)/m)[0]
        .replace('-- Up Migration', '');
      await db.query(up);
    }
  } finally {
    await db.end();
  }
}

let pool: pg.Pool;
let redis: Redis;
let mods: {
  applyMatchWinner: typeof import('../lib/match-outcome.js').applyMatchWinner;
  TournamentsService: typeof import('../modules/tournaments/tournaments.service.js').TournamentsService;
  AdminMatchesService: typeof import('../modules/admin/services/matches.service.js').AdminMatchesService;
  AdminBuybacksService: typeof import('../modules/admin/services/buybacks-notifications.service.js').AdminBuybacksService;
  BookingsService: typeof import('../modules/bookings/bookings.service.js').BookingsService;
  MatchesService: typeof import('../modules/matches/matches.service.js').MatchesService;
  AdminTournamentsService: typeof import('../modules/admin/services/tournaments.service.js').AdminTournamentsService;
  PlayersService: typeof import('../modules/players/players.service.js').PlayersService;
  fulfillBuybackFromWebhook: typeof import('../lib/stripe.js').fulfillBuybackFromWebhook;
  createBuybackPaymentIntent: typeof import('../lib/stripe.js').createBuybackPaymentIntent;
  createApp: typeof import('../app.js').createApp;
};

let seq = 0;
async function user(opts: { bot?: string; vr?: boolean } = {}) {
  seq++;
  const r = await pool.query(
    `INSERT INTO users (email, password_hash, username, is_bot, bot_tournament_id, has_vr_headset)
     VALUES ($1, 'x', $2, $3, $4, $5) RETURNING id`,
    [`u${seq}@t.test`, `user${seq}`, !!opts.bot, opts.bot ?? null, opts.vr ?? true]
  );
  return r.rows[0].id as string;
}

async function tournament(status = 'in_progress', extra: { buybackPriceCents?: number } = {}) {
  const r = await pool.query(
    `INSERT INTO tournaments (name, game, start_date, end_date, status, phase, current_round_number, buyback_price_cents)
     VALUES ($1, 'VR Cricket', NOW() - INTERVAL '1 day', NOW() + INTERVAL '2 days', $2, 'normal', 1, $3) RETURNING id`,
    [`T${++seq}`, status, extra.buybackPriceCents ?? 500]
  );
  const id = r.rows[0].id as string;
  await pool.query(
    `INSERT INTO tournament_rounds (tournament_id, round_number, starts_at, ends_at, status)
     VALUES ($1, 1, NOW() - INTERVAL '1 hour', NOW() + INTERVAL '3 hours', 'active')`,
    [id]
  );
  return id;
}

async function participant(tid: string, uid: string, status = 'active', round = 1) {
  await pool.query(`INSERT INTO tournament_registrations (tournament_id, user_id) VALUES ($1, $2)`, [tid, uid]);
  await pool.query(
    `INSERT INTO tournament_participants (tournament_id, user_id, status, round_number) VALUES ($1, $2, $3, $4)`,
    [tid, uid, status, round]
  );
}

async function match(p1: string, p2: string, tid: string | null, status = 'in_progress', result: object = {}) {
  const r = await pool.query(
    `INSERT INTO matches (tournament_id, player1_id, player2_id, status, round_number, phase, result)
     VALUES ($1, $2, $3, $4, 1, 'normal', $5) RETURNING *`,
    [tid, p1, p2, status, JSON.stringify(result)]
  );
  return r.rows[0];
}

const tp = async (tid: string, uid: string) =>
  (await pool.query(`SELECT * FROM tournament_participants WHERE tournament_id = $1 AND user_id = $2`, [tid, uid]))
    .rows[0];
const rating = async (uid: string) =>
  (await pool.query(`SELECT rating_points FROM users WHERE id = $1`, [uid])).rows[0].rating_points as number;

async function slot(capacity = 4) {
  const v = await pool.query(
    `INSERT INTO venues (name, address, city, country, location)
     VALUES ('V', 'A', 'Lahore', 'PK', ST_SetSRID(ST_MakePoint(74.3, 31.5), 4326)) RETURNING id`
  );
  const s = await pool.query(
    `INSERT INTO time_slots (venue_id, start_time, end_time, max_capacity)
     VALUES ($1, NOW() + make_interval(hours => $2), NOW() + make_interval(hours => $2 + 1), $3) RETURNING id`,
    [v.rows[0].id, ++seq, capacity]
  );
  return s.rows[0].id as string;
}
const slotRow = async (id: string) => (await pool.query(`SELECT * FROM time_slots WHERE id = $1`, [id])).rows[0];

beforeAll(async () => {
  await resetDatabase();
  pool = new pg.Pool({ connectionString: DB_URL });
  redis = new Redis(env.REDIS_URL);
  mods = {
    ...(await import('../lib/match-outcome.js')),
    ...(await import('../modules/tournaments/tournaments.service.js')),
    ...(await import('../modules/admin/services/matches.service.js')),
    ...(await import('../modules/admin/services/buybacks-notifications.service.js')),
    ...(await import('../modules/bookings/bookings.service.js')),
    ...(await import('../modules/matches/matches.service.js')),
    ...(await import('../modules/admin/services/tournaments.service.js')),
    ...(await import('../modules/players/players.service.js')),
    ...(await import('../lib/stripe.js')),
    ...(await import('../app.js')),
  };
}, 120000);

afterAll(async () => {
  const { closeRedis } = await import('../lib/redis.js');
  const { getNotificationQueue } = await import('../lib/bullmq.js');
  const { getMatchmakingQueue } = await import('../lib/matchmaking-queue.js');
  await getNotificationQueue(env).close();
  await getMatchmakingQueue(env).close();
  await closeRedis();
  await redis?.flushdb();
  await redis?.quit();
  await pool?.end();
});

beforeEach(() => {
  stripeCalls.refunds.length = 0;
  stripeCalls.intentStatus = 'succeeded';
});

describe('C1 match outcome is applied once', () => {
  it('a second (or concurrent) resolution changes nothing', async () => {
    const tid = await tournament();
    const [a, b] = [await user(), await user()];
    await participant(tid, a);
    await participant(tid, b);
    const m = await match(a, b, tid);
    const before = await rating(a);

    await Promise.all([
      mods.applyMatchWinner(pool, redis, undefined, m.id, m, {} as never, a),
      mods.applyMatchWinner(pool, redis, undefined, m.id, m, {} as never, a),
    ]);
    await mods.applyMatchWinner(pool, redis, undefined, m.id, m, {} as never, b);

    expect((await tp(tid, a)).wins).toBe(1);
    expect((await tp(tid, a)).round_number).toBe(2);
    expect((await tp(tid, b)).status).toBe('eliminated');
    expect((await rating(a)) - before).toBe(RATING_WIN_POINTS);
  });

  it('admin setResult on a completed match is rejected', async () => {
    const [a, b] = [await user(), await user()];
    const m = await match(a, b, null, 'completed', { winnerId: a });
    const admin = new mods.AdminMatchesService(pool, redis, env);
    await expect(admin.setResult(a, m.id, { winnerId: b } as never)).rejects.toMatchObject({ status: 409 });
    await expect(admin.forceConfirm(a, m.id)).rejects.toMatchObject({ status: 409 });
    await expect(admin.forceExpire(a, m.id)).rejects.toMatchObject({ status: 409 });
  });
});

describe('H10 late result uses the match round', () => {
  it('does not re-advance a winner already past that round', async () => {
    const tid = await tournament();
    const [a, b] = [await user(), await user()];
    await participant(tid, a, 'active', 2);
    await participant(tid, b, 'active', 2);
    const m = await match(a, b, tid);
    await mods.applyMatchWinner(pool, redis, undefined, m.id, m, {} as never, a);
    expect((await tp(tid, a)).round_number).toBe(2);
    expect((await tp(tid, a)).wins).toBe(0);
    expect((await tp(tid, b)).status).toBe('active');
  });
});

describe('M12 bots', () => {
  it('a bot win moves no rating and no bot standing', async () => {
    const tid = await tournament();
    const human = await user();
    const bot = await user({ bot: tid });
    await participant(tid, human);
    await participant(tid, bot);
    const m = await match(human, bot, tid);
    const before = await rating(human);
    await mods.applyMatchWinner(pool, redis, undefined, m.id, m, {} as never, bot);
    expect(await rating(human)).toBe(before);
    expect((await tp(tid, bot)).wins).toBe(0);
    expect((await tp(tid, human)).status).toBe('eliminated');
    const standings = await new mods.TournamentsService(pool, redis).getParticipants(tid);
    expect(standings.map((p) => p.userId)).toEqual([human]);
  });
});

describe('H11 withdrawing after the opponent batted', () => {
  it('credits the opponent and advances them', async () => {
    const tid = await tournament();
    const [quitter, batted] = [await user(), await user()];
    await participant(tid, quitter);
    await participant(tid, batted);
    const m = await match(quitter, batted, tid, 'in_progress', { player1Score: null, player2Score: 20 });
    await new mods.TournamentsService(pool, redis).withdraw(tid, quitter);

    const row = (await pool.query(`SELECT status, result FROM matches WHERE id = $1`, [m.id])).rows[0];
    expect(row.status).toBe('completed');
    expect(row.result.winnerId).toBe(batted);
    expect((await tp(tid, batted)).wins).toBe(1);
    expect((await tp(tid, batted)).round_number).toBe(2);
    expect((await tp(tid, quitter)).status).toBe('out');
  });
});

describe('H2 / H4 seats', () => {
  it('book, cancel, rebook works and the count follows', async () => {
    const s = await slot();
    const u = await user({ vr: false });
    const bookings = new mods.BookingsService(pool, redis);
    const first = await bookings.create(u, s);
    await bookings.cancel(u, first.id);
    await bookings.create(u, s);
    expect((await slotRow(s)).booked_count).toBe(1);
  });

  it('changing slot on entry gives the old seat back, and a failed registration keeps none', async () => {
    const tid = await tournament('open');
    const s1 = await slot();
    const s2 = await slot();
    await pool.query(`UPDATE time_slots SET start_time = NOW() + make_interval(mins => 30 + (id = $1)::int * 60),
                      end_time = NOW() + make_interval(mins => 60 + (id = $1)::int * 60) WHERE id IN ($1, $2)`, [s2, s1]);
    const u = await user({ vr: false });
    const service = new mods.TournamentsService(pool, redis);
    await service.enter(tid, u, { timeSlotId: s1 } as never);
    await service.enter(tid, u, { timeSlotId: s2 } as never);
    expect((await slotRow(s1)).booked_count).toBe(0);
    expect((await slotRow(s2)).booked_count).toBe(1);

    const blocked = await user({ vr: false });
    await pool.query(`UPDATE tournaments SET max_players = 1 WHERE id = $1`, [tid]);
    await expect(service.enter(tid, blocked, { timeSlotId: s1 } as never)).rejects.toMatchObject({ status: 409 });
    expect((await slotRow(s1)).booked_count).toBe(0);
  });

  it('cancelling a booking keeps a match lock', async () => {
    const s = await slot();
    const u = await user({ vr: false });
    const bookings = new mods.BookingsService(pool, redis);
    const b = await bookings.create(u, s);
    await pool.query(`UPDATE time_slots SET status = 'locked' WHERE id = $1`, [s]);
    await bookings.cancel(u, b.id);
    const row = await slotRow(s);
    expect([row.status, row.booked_count]).toEqual(['locked', 0]);
  });

  it('confirming refuses to overbook, declining releases the match seats', async () => {
    const matches = new mods.MatchesService(pool, redis);
    const full = await slot(1);
    const [a, b] = [await user({ vr: false }), await user({ vr: false })];
    const over = await match(a, b, null, 'pending_confirmation');
    await pool.query(`UPDATE matches SET time_slot_id = $1 WHERE id = $2`, [full, over.id]);
    await matches.confirm(over.id, a);
    await expect(matches.confirm(over.id, b)).rejects.toMatchObject({ status: 409 });
    expect((await slotRow(full)).booked_count).toBe(0);

    const s = await slot(4);
    const [c, d] = [await user({ vr: false }), await user({ vr: false })];
    const m = await match(c, d, null, 'pending_confirmation');
    await pool.query(`UPDATE matches SET time_slot_id = $1 WHERE id = $2`, [s, m.id]);
    await matches.confirm(m.id, c);
    await matches.confirm(m.id, d);
    expect((await slotRow(s)).booked_count).toBe(2);
    await matches.decline(m.id, c, { requeue: false } as never);
    expect((await slotRow(s)).booked_count).toBe(0);
  });
});

describe('C6 / M14 buybacks', () => {
  async function paidBuyback(status: string, opts: { roundOpen?: boolean } = {}) {
    const tid = await tournament();
    const u = await user();
    await participant(tid, u, 'eliminated');
    if (opts.roundOpen === false) {
      await pool.query(`UPDATE tournament_rounds SET status = 'closed' WHERE tournament_id = $1`, [tid]);
    }
    const pi = `pi_${++seq}`;
    const b = await pool.query(
      `INSERT INTO buybacks (user_id, tournament_id, round_number, amount_cents, status, stripe_payment_intent_id)
       VALUES ($1, $2, 1, 500, $3, $4) RETURNING id`,
      [u, tid, status, pi]
    );
    return { tid, u, pi, id: b.rows[0].id as string };
  }
  const buyback = async (id: string) => (await pool.query(`SELECT * FROM buybacks WHERE id = $1`, [id])).rows[0];

  it('a success after a decline still grants the buyback', async () => {
    const { tid, u, pi, id } = await paidBuyback('failed');
    await mods.fulfillBuybackFromWebhook(pool, redis, env, pi);
    expect((await buyback(id)).status).toBe('completed');
    expect((await tp(tid, u)).status).toBe('active');
  });

  it('a payment that can no longer be applied is refunded once', async () => {
    const { pi, id } = await paidBuyback('pending', { roundOpen: false });
    await mods.fulfillBuybackFromWebhook(pool, redis, env, pi);
    await mods.fulfillBuybackFromWebhook(pool, redis, env, pi);
    const row = await buyback(id);
    expect(row.status).toBe('failed');
    expect(row.refunded_at).not.toBeNull();
    expect(stripeCalls.refunds).toHaveLength(1);
    expect(stripeCalls.refunds[0].opts).toEqual({ idempotencyKey: `buyback-refund:${id}` });
  });

  it('a player live in another tournament is refunded, not left pending', async () => {
    const { u, pi, id } = await paidBuyback('pending');
    const other = await tournament();
    await participant(other, u, 'active');
    await mods.fulfillBuybackFromWebhook(pool, redis, env, pi);
    expect((await buyback(id)).refunded_at).not.toBeNull();
  });

  it('admin refund accepts a paid failed row, reverts only the buyback state, and refuses twice', async () => {
    const admin = new mods.AdminBuybacksService(pool, redis, env);
    const failed = await paidBuyback('failed');
    await admin.refund(failed.u, failed.id);
    expect((await buyback(failed.id)).refunded_at).not.toBeNull();
    expect((await tp(failed.tid, failed.u)).status).toBe('eliminated');
    await expect(admin.refund(failed.u, failed.id)).rejects.toMatchObject({ status: 409 });

    const done = await paidBuyback('completed');
    await pool.query(`UPDATE tournament_participants SET status = 'active' WHERE user_id = $1`, [done.u]);
    await admin.refund(done.u, done.id);
    expect((await tp(done.tid, done.u)).status).toBe('eliminated');

    stripeCalls.intentStatus = 'requires_payment_method';
    const unpaid = await paidBuyback('pending');
    await expect(admin.refund(unpaid.u, unpaid.id)).rejects.toMatchObject({ status: 409 });
  });

  it('a double-click opens one checkout', async () => {
    const tid = await tournament();
    const u = await user();
    const params = { userId: u, tournamentId: tid, roundNumber: 1, matchId: null, amountCents: 500 };
    const results = await Promise.allSettled([
      mods.createBuybackPaymentIntent(env, pool, params),
      mods.createBuybackPaymentIntent(env, pool, params),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const pending = await pool.query(`SELECT 1 FROM buybacks WHERE user_id = $1 AND status = 'pending'`, [u]);
    expect(pending.rowCount).toBe(1);
  });

  it('checkout refuses a price below the Stripe minimum', async () => {
    const tid = await tournament('in_progress', { buybackPriceCents: 30 });
    await pool.query(`UPDATE tournaments SET initial_player_count = 4 WHERE id = $1`, [tid]);
    for (let i = 0; i < 3; i++) await participant(tid, await user());
    const u = await user();
    await participant(tid, u, 'eliminated');
    await expect(
      new mods.TournamentsService(pool, redis, env).createBuybackCheckout(tid, u, {})
    ).rejects.toMatchObject({ status: 409, message: 'Buybacks are not available for this tournament' });
  });
});

describe('GET /integrations/meta/tournaments/live', () => {
  it('lists open and running tournaments only, running first', async () => {
    await pool.query(`UPDATE tournaments SET status = 'completed'`);
    const running = await tournament('in_progress');
    const open = await tournament('open');
    await tournament('draft');
    await pool.query(
      `UPDATE tournaments SET registration_opens_at = NOW() - INTERVAL '1 hour',
              registration_closes_at = NOW() + INTERVAL '1 hour' WHERE id = $1`,
      [open]
    );
    const app = mods.createApp(pool, redis, env);
    const res = await request(app)
      .get('/api/v1/integrations/meta/tournaments/live')
      .set('x-meta-api-key', env.META_API_KEY);
    expect(res.status).toBe(200);
    expect(res.body.data.hasLiveTournament).toBe(true);
    expect(res.body.data.tournaments.map((t: { id: string }) => t.id)).toEqual([running, open]);
    expect(res.body.data.tournaments[1]).toMatchObject({ status: 'open', registrationOpen: true });
    expect(res.body.data.tournaments[0].registrationOpen).toBe(false);

    const denied = await request(app).get('/api/v1/integrations/meta/tournaments/live');
    expect(denied.status).toBe(401);
  });
});

describe('E2E #3 play never opens before the tournament starts', () => {
  async function futureTournament(status: string) {
    const r = await pool.query(
      `INSERT INTO tournaments (name, game, start_date, end_date, status, phase, current_round_number, round_duration_minutes)
       VALUES ($1, 'VR Cricket', NOW() + INTERVAL '48 hours', NOW() + INTERVAL '7 days', $2, 'normal', 1, 2880)
       RETURNING id, start_date`,
      [`T${++seq}`, status]
    );
    // Stale round 1 that opens before the tournament, as the dev seed writes it.
    await pool.query(
      `INSERT INTO tournament_rounds (tournament_id, round_number, starts_at, ends_at, status)
       VALUES ($1, 1, NOW() - INTERVAL '1 hour', NOW() + INTERVAL '5 days', 'active')`,
      [r.rows[0].id]
    );
    return { id: r.rows[0].id as string, startDate: r.rows[0].start_date as Date };
  }
  async function slotAt(hours: number) {
    const v = await pool.query(
      `INSERT INTO venues (name, address, city, country, location)
       VALUES ('V', 'A', 'Lahore', 'PK', ST_SetSRID(ST_MakePoint(74.3, 31.5), 4326)) RETURNING id`
    );
    const r = await pool.query(
      `INSERT INTO time_slots (venue_id, start_time, end_time, max_capacity)
       VALUES ($1, date_trunc('hour', NOW()) + make_interval(hours => $2), date_trunc('hour', NOW()) + make_interval(hours => $2 + 1), 4)
       RETURNING id, start_time`,
      [v.rows[0].id, hours]
    );
    return { id: r.rows[0].id as string, date: (r.rows[0].start_time as Date).toISOString().slice(0, 10) };
  }

  it('offers and accepts only slots from the start date, and pairing reads the same window', async () => {
    const t = await futureTournament('open');
    const early = await slotAt(3);
    const late = await slotAt(50);
    const u = await user();
    const service = new mods.TournamentsService(pool, redis);

    await expect(service.enter(t.id, u, { timeSlotId: early.id } as never)).rejects.toMatchObject({ status: 409 });
    const earlyDay = await service.getSlotOptions(t.id, u, { date: early.date });
    expect(earlyDay.round?.startsAt).toBe(t.startDate.toISOString());
    expect(earlyDay.slots.map((x) => x.id)).not.toContain(early.id);
    const lateDay = await service.getSlotOptions(t.id, u, { date: late.date });
    expect(lateDay.slots.map((x) => x.id)).toContain(late.id);
    await expect(service.enter(t.id, u, { timeSlotId: late.id } as never)).resolves.toMatchObject({ searching: true });

    const pairWindow = await pool.query(
      `SELECT ${ROUND_PLAY_STARTS_AT_SQL} AS starts_at FROM tournament_rounds tr
       JOIN tournaments t ON t.id = tr.tournament_id WHERE tr.tournament_id = $1`,
      [t.id]
    );
    expect((pairWindow.rows[0].starts_at as Date).toISOString()).toBe(t.startDate.toISOString());
  });

  it('starting early opens the round now, and an empty tournament cannot start', async () => {
    const admin = new mods.AdminTournamentsService(pool, redis, env);
    const actor = await user();
    const empty = await futureTournament('closed');
    await expect(admin.start(actor, empty.id)).rejects.toMatchObject({ status: 409, message: 'No players are registered yet' });

    const t = await futureTournament('closed');
    const u = await user();
    await participant(t.id, u);
    await admin.start(actor, t.id);
    const round = (await pool.query(`SELECT starts_at, ends_at FROM tournament_rounds WHERE tournament_id = $1`, [t.id])).rows[0];
    expect(Math.abs(new Date(round.starts_at).getTime() - Date.now())).toBeLessThan(60_000);
    expect(new Date(round.ends_at).getTime() - new Date(round.starts_at).getTime()).toBe(2880 * 60_000);

    const early = await slotAt(3);
    await expect(
      new mods.TournamentsService(pool, redis).enter(t.id, u, { timeSlotId: early.id } as never)
    ).resolves.toMatchObject({ searching: true });
  });
});

describe('E2E #4/#5/#6 notifications, admin matches, public history', () => {
  it('match notifications name the opponent, tournament and round, and link to matches', async () => {
    const tid = await tournament();
    const [a, b] = [await user(), await user()];
    const m = await match(a, b, tid, 'pending_confirmation');
    const name = (await pool.query(`SELECT name FROM tournaments WHERE id = $1`, [tid])).rows[0].name;
    const opp = (await pool.query(`SELECT username FROM users WHERE id = $1`, [b])).rows[0].username;
    const d = await matchNotificationDetails(pool, 'match_expired', m.id, a);
    expect(d.message).toBe(`Your match against ${opp} in ${name}, Round 1 expired before it was played.`);
    expect(d).toMatchObject({ link: '/matches', tournamentId: tid, opponentUsername: opp, roundNumber: 1 });
    const unknown = await matchNotificationDetails(pool, 'match_found', 'demo', a);
    expect(unknown.message).toBe('New match against your opponent.');
  });

  it('an admin-created match takes its venue, time and round from the slot and tournament', async () => {
    const tid = await tournament();
    const s = await slot();
    const [a, b] = [await user(), await user()];
    const created = await new mods.AdminMatchesService(pool, redis, env).create(a, {
      player1Id: a,
      player2Id: b,
      tournamentId: tid,
      timeSlotId: s,
    } as never);
    const row = await slotRow(s);
    expect(created.scheduledAt).toBe((row.start_time as Date).toISOString());
    expect(created.venueId).toBe(row.venue_id);
    expect([created.roundNumber, created.phase]).toEqual([1, 'normal']);
  });

  it('a public profile lists completed matches only', async () => {
    const [a, b] = [await user(), await user()];
    const done = await match(a, b, null, 'completed', { winnerId: a });
    for (const status of ['pending_confirmation', 'cancelled', 'expired']) await match(a, b, null, status);
    const username = (await pool.query(`SELECT username FROM users WHERE id = $1`, [a])).rows[0].username;
    const list = await new mods.PlayersService(pool).getPublicMatches(username);
    expect(list.map((m) => m.id)).toEqual([done.id]);
  });
});
