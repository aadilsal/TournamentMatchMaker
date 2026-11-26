import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import pg from 'pg';
import { Redis } from 'ioredis';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { readFileSync, readdirSync } from 'fs';
import { dirname, join as joinPath, resolve } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import type { Env } from '../config/env.js';

// Draw-format entry (venue / Home), journey, player card, and the headset score path.

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../../.env'), override: true });

const refunds: unknown[] = [];
jest.unstable_mockModule('stripe', () => ({
  default: class {
    paymentIntents = {
      create: async () => ({ id: `pi_${Math.random().toString(36).slice(2)}`, client_secret: 'cs_test' }),
      retrieve: async () => ({ status: 'succeeded', client_secret: 'cs_test' }),
    };
    refunds = {
      create: async (params: unknown) => {
        refunds.push(params);
        return { id: 're_test' };
      },
    };
  },
}));

const DB_URL = (() => {
  const raw = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!raw) throw new Error('TEST_DATABASE_URL must be set');
  const url = new URL(raw);
  url.pathname = `/${url.pathname.slice(1).replace(/_test$/, '')}_draw_api_test`;
  return url.toString();
})();
const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
redisUrl.pathname = '/7';

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
  META_API_KEY: 'draw-entry-meta-key-123456',
  STRIPE_SECRET_KEY: 'sk_test_draw',
  STRIPE_WEBHOOK_SECRET: 'whsec_draw',
  AWS_ACCESS_KEY_ID: 'sample-aws-access-key',
  AWS_SECRET_ACCESS_KEY: 'sample-aws-secret-key',
  AWS_REGION: 'us-east-1',
  AWS_SES_FROM_EMAIL: 'notifications@pixelpaddle.com',
} as unknown as Env;

async function resetDatabase() {
  const admin = new URL(DB_URL);
  const dbName = admin.pathname.slice(1);
  admin.pathname = '/postgres';
  const a = new pg.Pool({ connectionString: admin.toString() });
  try {
    const exists = await a.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (!exists.rows[0]) await a.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await a.end();
  }
  const db = new pg.Pool({ connectionString: DB_URL });
  try {
    await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    const dir = joinPath(__dirname, '../../../../packages/db/migrations');
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      await db.query(readFileSync(joinPath(dir, file), 'utf-8').split(/^-- Down Migration/m)[0]);
    }
  } finally {
    await db.end();
  }
}

let pool: pg.Pool;
let redis: Redis;
let app: import('express').Express;

let seq = 0;
async function user(opts: { vr?: boolean; bot?: string; role?: string } = {}) {
  seq++;
  const r = await pool.query(
    `INSERT INTO users (email, password_hash, username, has_vr_headset, is_bot, bot_tournament_id, role)
     VALUES ($1, 'x', $2, $3, $4, $5, $6) RETURNING id`,
    [`d${seq}@t.test`, `drawer${seq}`, opts.vr ?? true, !!opts.bot, opts.bot ?? null, opts.role ?? 'player']
  );
  return r.rows[0].id as string;
}
const auth = (id: string, role = 'player') => ({
  Authorization: `Bearer ${jwt.sign(
    { sub: id, email: `${id}@t.test`, role, jti: randomBytes(8).toString('hex') },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '15m' }
  )}`,
});
const meta = { 'x-meta-api-key': 'draw-entry-meta-key-123456' };

async function venue(active = true) {
  const r = await pool.query(
    `INSERT INTO venues (name, address, city, country, location, active)
     VALUES ('Super Over Arena', 'A', 'Lahore', 'PK', ST_SetSRID(ST_MakePoint(74.3, 31.5), 4326), $1) RETURNING id`,
    [active]
  );
  return r.rows[0].id as string;
}

async function tournament(opts: { format?: string; status?: string; startsIn?: string; max?: number } = {}) {
  const r = await pool.query(
    `INSERT INTO tournaments (name, game, start_date, end_date, status, phase, play_format, max_players)
     VALUES ($1, 'VR Cricket', NOW() + $2::interval, NOW() + INTERVAL '10 days', $3, $4, $5, $6) RETURNING id`,
    [
      `Cup ${++seq}`,
      opts.startsIn ?? '1 day',
      opts.status ?? 'open',
      (opts.format ?? 'draw') === 'draw' ? 'draw' : 'normal',
      opts.format ?? 'draw',
      opts.max ?? null,
    ]
  );
  return r.rows[0].id as string;
}

/** A live draw tournament with an open round 1 and one match between `a` and `b`. */
async function liveDrawMatch(a: string, b: string, closesIn = '2 hours', opts: { label?: string; twoMatches?: boolean } = {}) {
  const tid = await tournament({ status: 'in_progress', startsIn: '-1 hour' });
  await pool.query(`UPDATE tournaments SET current_round_number = 1 WHERE id = $1`, [tid]);
  await pool.query(
    `INSERT INTO tournament_rounds (tournament_id, round_number, starts_at, ends_at, status)
     VALUES ($1, 1, NOW() - INTERVAL '1 hour', NOW() + $2::interval, 'active')`,
    [tid, closesIn]
  );
  for (const uid of [a, b]) {
    await pool.query(
      `INSERT INTO tournament_registrations (tournament_id, user_id, play_location) VALUES ($1, $2, 'home')`,
      [tid, uid]
    );
    await pool.query(
      `INSERT INTO tournament_participants (tournament_id, user_id, status, round_number) VALUES ($1, $2, 'active', 1)`,
      [tid, uid]
    );
  }
  const m = await pool.query(
    `INSERT INTO matches (tournament_id, player1_id, player2_id, status, round_number, phase, bracket_slot, result)
     VALUES ($1, $2, $3, 'confirmed', 1, 'draw', 0, $4) RETURNING id`,
    [tid, a, b, JSON.stringify({ roundLabel: opts.label ?? 'Final' })]
  );
  if (opts.twoMatches) {
    const [c, e] = [await user(), await user()];
    for (const uid of [c, e]) {
      await pool.query(`INSERT INTO tournament_registrations (tournament_id, user_id, play_location) VALUES ($1, $2, 'home')`, [tid, uid]);
      await pool.query(`INSERT INTO tournament_participants (tournament_id, user_id, status, round_number) VALUES ($1, $2, 'active', 1)`, [tid, uid]);
    }
    await pool.query(
      `INSERT INTO matches (tournament_id, player1_id, player2_id, status, round_number, phase, bracket_slot, result)
       VALUES ($1, $2, $3, 'confirmed', 1, 'draw', 1, $4)`,
      [tid, c, e, JSON.stringify({ roundLabel: opts.label ?? 'Final' })]
    );
  }
  return { tid, matchId: m.rows[0].id as string };
}

const score = (matchId: string, userId: string, value: number) =>
  request(app).post(`/api/v1/integrations/meta/matches/${matchId}/scores`).set(meta).send({ userId, score: value });
const current = (userId: string, tournamentId?: string) =>
  request(app)
    .get('/api/v1/integrations/meta/matches/current')
    .set(meta)
    .query(tournamentId ? { userId, tournamentId } : { userId });
const participant = async (tid: string, uid: string) =>
  (await pool.query(`SELECT status, round_number, wins, losses FROM tournament_participants WHERE tournament_id = $1 AND user_id = $2`, [tid, uid])).rows[0];

beforeAll(async () => {
  await resetDatabase();
  pool = new pg.Pool({ connectionString: DB_URL });
  redis = new Redis(env.REDIS_URL);
  const { createApp } = await import('../app.js');
  app = createApp(pool, redis as never, env) as never;
}, 120_000);

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

describe('joining a draw tournament', () => {
  it('joins at a venue, then switches to Home before the start', async () => {
    const [tid, vid, me] = [await tournament(), await venue(), await user()];
    const first = await request(app).post(`/api/v1/tournaments/${tid}/join`).set(auth(me)).send({ venueId: vid });
    expect(first.status).toBe(201);
    expect(first.body.data.registration).toMatchObject({ playLocation: 'venue', venue: { id: vid } });

    const again = await request(app).post(`/api/v1/tournaments/${tid}/join`).set(auth(me)).send({ home: true });
    expect(again.status).toBe(200);
    expect(again.body.data.created).toBe(false);
    const reg = await pool.query(`SELECT play_location, venue_id FROM tournament_registrations WHERE tournament_id = $1 AND user_id = $2`, [tid, me]);
    expect(reg.rows[0]).toEqual({ play_location: 'home', venue_id: null });
  });

  it('refuses Home without a headset, an inactive venue, and an empty choice', async () => {
    const [tid, closed, me] = [await tournament(), await venue(false), await user({ vr: false })];
    const home = await request(app).post(`/api/v1/tournaments/${tid}/join`).set(auth(me)).send({ home: true });
    expect(home.status).toBe(400);
    const inactive = await request(app).post(`/api/v1/tournaments/${tid}/join`).set(auth(me)).send({ venueId: closed });
    expect(inactive.status).toBe(400);
    const empty = await request(app).post(`/api/v1/tournaments/${tid}/join`).set(auth(me)).send({});
    expect(empty.status).toBe(400);
  });

  it('refuses classic, started and draft tournaments', async () => {
    const me = await user();
    const classic = await tournament({ format: 'classic' });
    const started = await tournament({ startsIn: '-1 minute' });
    const draft = await tournament({ status: 'draft' });
    for (const [tid, code] of [[classic, 409], [started, 409], [draft, 404]] as const) {
      const res = await request(app).post(`/api/v1/tournaments/${tid}/join`).set(auth(me)).send({ home: true });
      expect(res.status).toBe(code);
    }
  });

  it('never overfills when players race for the last places', async () => {
    const tid = await tournament({ max: 3 });
    const players = await Promise.all(Array.from({ length: 8 }, () => user()));
    const results = await Promise.all(
      players.map((p) => request(app).post(`/api/v1/tournaments/${tid}/join`).set(auth(p)).send({ home: true }))
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 409)).toHaveLength(5);
    const count = await pool.query(`SELECT COUNT(*)::int AS n FROM tournament_registrations WHERE tournament_id = $1`, [tid]);
    expect(count.rows[0].n).toBe(3);
  });

  it('lets a player leave before the start, not after', async () => {
    const [tid, me] = [await tournament(), await user()];
    await request(app).post(`/api/v1/tournaments/${tid}/join`).set(auth(me)).send({ home: true });
    const left = await request(app).delete(`/api/v1/tournaments/${tid}/join`).set(auth(me));
    expect(left.status).toBe(200);

    await request(app).post(`/api/v1/tournaments/${tid}/join`).set(auth(me)).send({ home: true });
    await pool.query(`UPDATE tournaments SET start_date = NOW() - INTERVAL '1 second' WHERE id = $1`, [tid]);
    const late = await request(app).delete(`/api/v1/tournaments/${tid}/join`).set(auth(me));
    expect(late.status).toBe(409);
  });

  it('lets one player join several tournaments', async () => {
    const me = await user();
    for (const tid of [await tournament(), await tournament()]) {
      const res = await request(app).post(`/api/v1/tournaments/${tid}/join`).set(auth(me)).send({ home: true });
      expect(res.status).toBe(201);
    }
  });
});

describe('journey and my tournaments', () => {
  it('sends a newcomer to choose a tournament, then to my tournaments', async () => {
    const me = await user();
    const before = await request(app).get('/api/v1/players/me/journey').set(auth(me));
    expect(before.body.data.step).toBe('choose_tournament');

    const [tid, vid] = [await tournament(), await venue()];
    await request(app).post(`/api/v1/tournaments/${tid}/join`).set(auth(me)).send({ venueId: vid });
    const after = await request(app).get('/api/v1/players/me/journey').set(auth(me));
    expect(after.body.data).toMatchObject({ step: 'my_tournaments', activeTournamentCount: 1 });

    const mine = await request(app).get('/api/v1/players/me/tournaments').set(auth(me)).query({ timeZone: 'Asia/Karachi' });
    expect(mine.status).toBe(200);
    expect(mine.body.data.tournaments[0]).toMatchObject({
      id: tid,
      myStatus: 'registered',
      playingAt: { type: 'venue', name: 'Super Over Arena' },
    });
  });

  it('will not turn the headset off while playing from Home', async () => {
    const [tid, me] = [await tournament(), await user()];
    await request(app).post(`/api/v1/tournaments/${tid}/join`).set(auth(me)).send({ home: true });
    const res = await request(app).patch('/api/v1/players/me').set(auth(me)).send({ hasVrHeadset: false });
    expect(res.status).toBe(409);
  });
});

describe('headset play in a draw match', () => {
  it('a win sends the winner through and knocks the loser out', async () => {
    const [a, b] = [await user(), await user()];
    const { tid, matchId } = await liveDrawMatch(a, b);
    expect((await score(matchId, a, 24)).status).toBe(200);

    const chase = await current(b);
    expect(chase.body.data.match).toMatchObject({ id: matchId, amChasing: true, chaseTarget: 25, roundLabel: 'Final' });
    expect(chase.body.data.match.endTime).not.toBeNull();

    await score(matchId, b, 18);
    const m = await pool.query(`SELECT status, result FROM matches WHERE id = $1`, [matchId]);
    expect(m.rows[0].status).toBe('completed');
    expect(m.rows[0].result.winnerId).toBe(a);
    expect(await participant(tid, a)).toMatchObject({ status: 'active', round_number: 2, wins: 1 });
    expect(await participant(tid, b)).toMatchObject({ status: 'eliminated', losses: 1 });
  });

  it('a tie replays the same match and tells both players', async () => {
    const [a, b] = [await user(), await user()];
    const { matchId } = await liveDrawMatch(a, b);
    await score(matchId, a, 20);
    await score(matchId, b, 20);

    const m = await pool.query(`SELECT status, result FROM matches WHERE id = $1`, [matchId]);
    expect(m.rows[0].status).toBe('confirmed');
    expect(m.rows[0].result).toMatchObject({ tieCount: 1, tiedFirstBatterId: a, lastTie: { player1Score: 20, player2Score: 20 } });
    const innings = await pool.query(`SELECT COUNT(*)::int AS n FROM match_innings WHERE match_id = $1`, [matchId]);
    expect(innings.rows[0].n).toBe(0);

    const poll = await current(b);
    expect(poll.body.data.match.id).toBe(matchId);
    expect(poll.body.data.lastResult).toMatchObject({ outcome: 'tie', myScore: 20, opponentScore: 20, rematchQueued: true });
    expect((await score(matchId, b, 30)).status).toBe(200);
  });

  it('lists every open match and filters by tournament', async () => {
    const me = await user();
    const soon = await liveDrawMatch(me, await user(), '1 hour');
    const later = await liveDrawMatch(me, await user(), '5 hours');

    const all = await current(me);
    expect(all.body.data.matches.map((m: { id: string }) => m.id)).toEqual([soon.matchId, later.matchId]);
    expect(all.body.data.match.id).toBe(soon.matchId);
    expect(all.body.data.matches[0]).toMatchObject({ state: 'your_turn', tournamentName: expect.any(String) });

    const one = await current(me, later.tid);
    expect(one.body.data.match.id).toBe(later.matchId);
  });

  it('the bot waits for the human, then chases their score', async () => {
    const human = await user();
    const tid0 = await tournament({ status: 'in_progress', startsIn: '-1 hour' });
    const bot = await user({ bot: tid0 });
    const { matchId } = await liveDrawMatch(human, bot);

    await current(human);
    const none = await pool.query(`SELECT COUNT(*)::int AS n FROM match_innings WHERE match_id = $1`, [matchId]);
    expect(none.rows[0].n).toBe(0);

    await score(matchId, human, 22);
    await current(human);
    const m = await pool.query(`SELECT status, result FROM matches WHERE id = $1`, [matchId]);
    expect(m.rows[0].status).toBe('completed');
    expect(Math.abs((m.rows[0].result.player2Score as number) - 22)).toBeLessThanOrEqual(6);
    expect(m.rows[0].result.player2Score).not.toBe(22);
  });
});

describe('personalised player card', () => {
  it('comes back with a verified link code and on its own endpoint', async () => {
    const me = await user();
    await liveDrawMatch(me, await user());
    await redis.set('meta:link-code:4821', JSON.stringify({ userId: me, username: `drawer${seq}` }), 'EX', 60);
    const linked = await request(app).post('/api/v1/integrations/meta/identity/verify-link-code').set(meta).send({ code: '4821' });
    expect(linked.status).toBe(200);
    expect(linked.body.data.player).toMatchObject({ userId: me, record: { played: 0 } });
    expect(linked.body.data.player.tournaments[0]).toMatchObject({
      myStatus: 'active',
      playingAt: { type: 'home', name: 'Home' },
      match: { state: 'your_turn' },
    });

    const card = await request(app).get('/api/v1/integrations/meta/players/profile').set(meta).query({ userId: me, timeZone: 'Asia/Karachi' });
    expect(card.status).toBe(200);
    expect(card.body.data.greeting).toContain('your match is ready');
    const bad = await request(app).get('/api/v1/integrations/meta/players/profile').set(meta).query({ userId: me, timeZone: 'Mars/Base' });
    expect(bad.status).toBe(400);
  });
});

/** Notification jobs queued for a user (no worker runs in this Redis DB, so they stay queued). */
async function queued(userId: string, type: string) {
  const { getNotificationQueue } = await import('../lib/bullmq.js');
  const jobs = await getNotificationQueue(env).getJobs(['waiting', 'delayed', 'prioritized', 'paused']);
  return jobs
    .map((j) => j.data as { userId: string; type: string; payload: { message?: string } })
    .filter((d) => d.userId === userId && d.type === type);
}
const settle = () => new Promise((r) => setTimeout(r, 200));

describe('notifications during a draw match', () => {
  it('tells the opponent it is their turn, and offers a round-1 loser a buyback', async () => {
    const [a, b] = [await user(), await user()];
    const { tid, matchId } = await liveDrawMatch(a, b, '2 hours', { label: 'Semi-final', twoMatches: true });
    await pool.query(`UPDATE tournaments SET buyback_price_cents = 500 WHERE id = $1`, [tid]);
    await score(matchId, a, 24);
    await settle();
    const turn = await queued(b, 'opponent_played');
    expect(turn).toHaveLength(1);
    expect(turn[0].payload.message).toContain('score 25 to win');

    await score(matchId, b, 10);
    await settle();
    expect((await queued(a, 'match_won'))[0].payload.message).toContain('through');
    expect((await queued(b, 'match_lost'))[0].payload.message).toContain('buy back in for $5');
  });

  it('tells both players about a tie', async () => {
    const [a, b] = [await user(), await user()];
    const { matchId } = await liveDrawMatch(a, b);
    await score(matchId, a, 12);
    await score(matchId, b, 12);
    await settle();
    for (const p of [a, b]) expect((await queued(p, 'match_tied'))[0].payload.message).toContain('12–12');
  });
});

describe('round 1 buybacks', () => {
  async function loseRoundOne() {
    const [a, b] = [await user(), await user()];
    const { tid, matchId } = await liveDrawMatch(a, b, '2 hours', { label: 'Semi-final', twoMatches: true });
    await pool.query(`UPDATE tournaments SET buyback_price_cents = 500 WHERE id = $1`, [tid]);
    await score(matchId, a, 24);
    await score(matchId, b, 10);
    return { tid, loser: b };
  }
  const fulfil = async (tid: string, uid: string) => {
    const bb = await pool.query(`SELECT id FROM buybacks WHERE tournament_id = $1 AND user_id = $2`, [tid, uid]);
    const { TournamentsService } = await import('../modules/tournaments/tournaments.service.js');
    await new TournamentsService(pool, redis as never, env).fulfillBuyback(bb.rows[0].id);
    return (await pool.query(`SELECT status, refunded_at FROM buybacks WHERE id = $1`, [bb.rows[0].id])).rows[0];
  };

  it('puts a round-1 loser back into the round 2 draw', async () => {
    const { tid, loser } = await loseRoundOne();
    const offers = await request(app).get('/api/v1/players/me/buyback-options').set(auth(loser));
    expect(offers.body.data.map((o: { tournamentId: string }) => o.tournamentId)).toContain(tid);
    const checkout = await request(app).post(`/api/v1/tournaments/${tid}/buyback/checkout`).set(auth(loser)).send({});
    expect(checkout.status).toBe(201);

    expect((await fulfil(tid, loser)).status).toBe('completed');
    expect(await participant(tid, loser)).toMatchObject({ status: 'active', round_number: 2 });
  });

  it('refunds a buyback paid after round 1 closed', async () => {
    const { tid, loser } = await loseRoundOne();
    await request(app).post(`/api/v1/tournaments/${tid}/buyback/checkout`).set(auth(loser)).send({});
    await pool.query(`UPDATE tournament_rounds SET ends_at = NOW() - INTERVAL '1 second' WHERE tournament_id = $1`, [tid]);
    refunds.length = 0;
    const bb = await fulfil(tid, loser);
    expect(bb.status).toBe('failed');
    expect(bb.refunded_at).not.toBeNull();
    expect(refunds).toHaveLength(1);
    expect((await participant(tid, loser)).status).toBe('eliminated');
  });

  it('offers no buyback in a final, even in round 1', async () => {
    const [a, b] = [await user(), await user()];
    const { tid, matchId } = await liveDrawMatch(a, b);
    await pool.query(`UPDATE tournaments SET buyback_price_cents = 500 WHERE id = $1`, [tid]);
    await score(matchId, a, 24);
    await score(matchId, b, 10);
    const checkout = await request(app).post(`/api/v1/tournaments/${tid}/buyback/checkout`).set(auth(b)).send({});
    expect(checkout.status).toBe(409);
    await settle();
    expect((await queued(b, 'match_lost'))[0].payload.message).not.toContain('buy back');
  });

  it('offers no buyback after round 1', async () => {
    const { tid, loser } = await loseRoundOne();
    await pool.query(`UPDATE tournaments SET current_round_number = 2 WHERE id = $1`, [tid]);
    const checkout = await request(app).post(`/api/v1/tournaments/${tid}/buyback/checkout`).set(auth(loser)).send({});
    expect(checkout.status).toBe(409);
  });
});

describe('admin controls for draw tournaments', () => {
  it('creates from five fields, publishes, starts now and closes a round now', async () => {
    const admin = await user({ role: 'superadmin' });
    const as = auth(admin, 'superadmin');
    const startDate = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const created = await request(app)
      .post('/api/v1/admin/tournaments')
      .set(as)
      .send({ playFormat: 'draw', name: 'Admin Cup', startDate, roundDurationMinutes: 120, maxPlayers: 8, buybackPriceCents: 0 });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ playFormat: 'draw', phase: 'draw', status: 'draft', maxPlayers: 8 });
    // 8 players: 3 rounds of 2 hours after the start.
    expect(new Date(created.body.data.endDate).getTime() - new Date(startDate).getTime()).toBe(3 * 120 * 60_000);
    const id = created.body.data.id as string;

    expect((await request(app).post(`/api/v1/admin/tournaments/${id}/publish`).set(as)).status).toBe(200);
    expect((await request(app).post(`/api/v1/admin/tournaments/${id}/close-registration`).set(as)).status).toBe(409);
    expect((await request(app).post(`/api/v1/admin/tournaments/${id}/start`).set(as)).status).toBe(409);

    for (let i = 0; i < 2; i++) {
      await request(app).post(`/api/v1/tournaments/${id}/join`).set(auth(await user())).send({ home: true });
    }
    expect((await request(app).post(`/api/v1/admin/tournaments/${id}/start`).set(as)).status).toBe(200);
    const started = await pool.query(`SELECT start_date <= NOW() AS due FROM tournaments WHERE id = $1`, [id]);
    expect(started.rows[0].due).toBe(true);

    expect((await request(app).post(`/api/v1/admin/tournaments/${id}/close-round`).set(as)).status).toBe(409);
    await pool.query(`UPDATE tournaments SET status = 'in_progress', current_round_number = 1 WHERE id = $1`, [id]);
    await pool.query(
      `INSERT INTO tournament_rounds (tournament_id, round_number, starts_at, ends_at, status)
       VALUES ($1, 1, NOW(), NOW() + INTERVAL '2 hours', 'active')`,
      [id]
    );
    expect((await request(app).post(`/api/v1/admin/tournaments/${id}/close-round`).set(as)).status).toBe(200);
    const round = await pool.query(`SELECT ends_at <= NOW() AS due FROM tournament_rounds WHERE tournament_id = $1`, [id]);
    expect(round.rows[0].due).toBe(true);
  });
});

describe('overs per tournament', () => {
  it('admin picks the overs (1-20, default 1) and cannot change them once started', async () => {
    const as = auth(await user({ role: 'superadmin' }), 'superadmin');
    const startDate = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const create = (extra: Record<string, unknown>) =>
      request(app).post('/api/v1/admin/tournaments').set(as).send({ playFormat: 'draw', name: 'Overs Cup', startDate, roundDurationMinutes: 120, ...extra });

    expect((await create({})).body.data.overs).toBe(1);
    expect((await create({ overs: 21 })).status).toBe(400);
    expect((await create({ overs: 0 })).status).toBe(400);
    const made = await create({ overs: 5 });
    expect(made.status).toBe(201);
    expect(made.body.data.overs).toBe(5);

    const id = made.body.data.id as string;
    const edit = await request(app).patch(`/api/v1/admin/tournaments/${id}`).set(as).send({ overs: 7 });
    expect(edit.status).toBe(200);
    expect(edit.body.data.overs).toBe(7);

    await pool.query(`UPDATE tournaments SET status = 'in_progress' WHERE id = $1`, [id]);
    const locked = await request(app).patch(`/api/v1/admin/tournaments/${id}`).set(as).send({ overs: 10 });
    expect(locked.status).toBe(409);
    expect((await pool.query(`SELECT overs FROM tournaments WHERE id = $1`, [id])).rows[0].overs).toBe(7);
  });

  it('the headset gets the overs on the match, the match list, live tournaments and the player card', async () => {
    const [a, b] = [await user(), await user()];
    const { tid } = await liveDrawMatch(a, b);
    await pool.query(`UPDATE tournaments SET overs = 5 WHERE id = $1`, [tid]);

    const cur = await current(a);
    expect(cur.body.data.match).toMatchObject({ overs: 5, ballsPerInnings: 30 });
    expect(cur.body.data.matches[0]).toMatchObject({ overs: 5, ballsPerInnings: 30 });

    const live = await request(app).get('/api/v1/integrations/meta/tournaments/live').set(meta);
    expect(live.body.data.tournaments.find((t: { id: string }) => t.id === tid)).toMatchObject({
      overs: 5,
      ballsPerInnings: 30,
      currentRoundNumber: 1,
      playerCount: 2,
    });

    const card = await request(app).get('/api/v1/integrations/meta/players/profile').set(meta).query({ userId: a });
    expect(card.body.data.tournaments.find((t: { id: string }) => t.id === tid)).toMatchObject({ overs: 5, ballsPerInnings: 30 });
  });

  it('records balls faced when the headset sends them, and never rejects a score over it', async () => {
    const [a, b] = [await user(), await user()];
    const { matchId } = await liveDrawMatch(a, b);
    await current(a);
    const res = await request(app)
      .post(`/api/v1/integrations/meta/matches/${matchId}/scores`)
      .set(meta)
      .send({ userId: a, score: 14, ballsFaced: 6 });
    expect(res.status).toBe(200);
    const row = await pool.query(`SELECT balls_faced FROM match_innings WHERE match_id = $1 AND user_id = $2`, [matchId, a]);
    expect(row.rows[0].balls_faced).toBe(6);
  });
});

describe('innings start, heartbeat, abandon and batting stats', () => {
  const start = (matchId: string, userId: string) =>
    request(app).post(`/api/v1/integrations/meta/matches/${matchId}/start`).set(meta).send({ userId });
  const beat = (matchId: string, userId: string) =>
    request(app).post(`/api/v1/integrations/meta/matches/${matchId}/heartbeat`).set(meta).send({ userId });
  const poll = (userId: string) =>
    request(app).get('/api/v1/integrations/meta/matches/current').set(meta).query({ userId, explicitStart: 'true' });
  const goStale = (matchId: string, userId: string) =>
    pool.query(`UPDATE innings_attempts SET last_heartbeat_at = NOW() - INTERVAL '4 minutes' WHERE match_id = $1 AND user_id = $2`, [matchId, userId]);

  it('stores 4s, 6s and wickets, and drops 4s/6s that cannot fit the score', async () => {
    const [a, b] = [await user(), await user()];
    const { matchId } = await liveDrawMatch(a, b);
    await current(a);
    expect((await request(app).post(`/api/v1/integrations/meta/matches/${matchId}/scores`).set(meta)
      .send({ userId: a, score: 30, fours: 3, sixes: 2, wicketsLost: 1 })).status).toBe(200);
    expect((await request(app).post(`/api/v1/integrations/meta/matches/${matchId}/scores`).set(meta)
      .send({ userId: b, score: 10, fours: 2, sixes: 2, wicketsLost: 0 })).status).toBe(200);
    const rows = await pool.query(`SELECT user_id, fours, sixes, wickets_lost FROM match_innings WHERE match_id = $1`, [matchId]);
    const by = (id: string) => rows.rows.find((r) => r.user_id === id);
    expect(by(a)).toMatchObject({ fours: 3, sixes: 2, wickets_lost: 1 });
    expect(by(b)).toMatchObject({ fours: null, sixes: null, wickets_lost: 0 });
  });

  it('polling never claims the turn; Play does, and the other player waits', async () => {
    const [a, b] = [await user(), await user()];
    const { matchId } = await liveDrawMatch(a, b);
    expect((await poll(a)).body.data.match.amSettingTarget).toBe(true);
    expect((await poll(b)).body.data.match.amSettingTarget).toBe(true);

    const started = await start(matchId, b);
    expect(started.status).toBe(200);
    expect(started.body.data).toMatchObject({ amChasing: false, heartbeatIntervalSeconds: 30, abandonAfterSeconds: 180 });

    const waiting = (await poll(a)).body.data.match;
    expect(waiting).toMatchObject({ waitingForOpponent: true, amSettingTarget: false });
    expect(waiting.opponentBattingSince).not.toBeNull();
    expect(waiting.turnFreesAt).not.toBeNull();
    expect((await start(matchId, a)).status).toBe(409);
    expect((await start(matchId, b)).body.error.code).toBe('INNINGS_ALREADY_STARTED');
    expect((await beat(matchId, b)).status).toBe(200);
    expect((await poll(b)).body.data.match.myInningsStartedAt).not.toBeNull();
  });

  it('a batter-first who stops sending heartbeats scores 0, and the opponent chases 1', async () => {
    const [a, b] = [await user(), await user()];
    const { matchId } = await liveDrawMatch(a, b);
    await start(matchId, a);
    await goStale(matchId, a);

    const chase = (await poll(b)).body.data.match;
    expect(chase).toMatchObject({ amChasing: true, chaseTarget: 1, opponentScore: 0 });
    const row = await pool.query(`SELECT score, source FROM match_innings WHERE match_id = $1 AND user_id = $2`, [matchId, a]);
    expect(row.rows[0]).toMatchObject({ score: 0, source: 'abandoned' });
    expect((await beat(matchId, a)).body.error.code).toBe('INNINGS_ABANDONED');
  });

  it('a chaser who abandons scores 0, so the target-setter wins', async () => {
    const [a, b] = [await user(), await user()];
    const { matchId } = await liveDrawMatch(a, b);
    await current(a);
    await score(matchId, a, 18);
    expect((await start(matchId, b)).body.data).toMatchObject({ amChasing: true, chaseTarget: 19 });
    await goStale(matchId, b);
    await poll(a);
    const m = await pool.query(`SELECT status, result FROM matches WHERE id = $1`, [matchId]);
    expect(m.rows[0].status).toBe('completed');
    expect(m.rows[0].result.winnerId).toBe(a);
  });
});

describe('public tournament page: players, live round and stats', () => {
  const view = (tid: string, what: string) => request(app).get(`/api/v1/tournaments/${tid}/${what}`);
  const send = (matchId: string, body: Record<string, unknown>) =>
    request(app).post(`/api/v1/integrations/meta/matches/${matchId}/scores`).set(meta).send(body);

  it('lists who is playing, where, and whether they are still in', async () => {
    const [a, b] = [await user(), await user()];
    const { tid } = await liveDrawMatch(a, b);
    const res = await view(tid, 'players');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toMatchObject({ status: 'in', playingAt: 'Home', roundReached: 1 });
    expect((await view('not-a-uuid', 'players')).status).toBe(404);
  });

  it('shows the live round: to play, batting, chasing a target, then decided', async () => {
    const [a, b] = [await user(), await user()];
    const { tid, matchId } = await liveDrawMatch(a, b);
    const state = async () => (await view(tid, 'live')).body.data;

    expect((await state()).matches[0]).toMatchObject({ state: 'to_play', target: null });
    await request(app).post(`/api/v1/integrations/meta/matches/${matchId}/start`).set(meta).send({ userId: a });
    const batting = (await state()).matches[0];
    expect(batting.state).toBe('batting');
    expect(batting.player1.batting || batting.player2.batting).toBe(true);

    await send(matchId, { userId: a, score: 25 });
    expect((await state()).matches[0]).toMatchObject({ state: 'chasing', target: 26 });

    await send(matchId, { userId: b, score: 10 });
    const done = await state();
    expect(done.round).toMatchObject({ number: 1, label: 'Final' });
    expect(done.matches[0].state === 'decided' || done.round === null).toBe(true);
  });

  it('totals 4s, 6s and wickets and ranks the leaderboards, leaving bots out', async () => {
    const [a, b] = [await user(), await user()];
    const { tid, matchId } = await liveDrawMatch(a, b);
    await current(a);
    await send(matchId, { userId: a, score: 40, fours: 2, sixes: 4, wicketsLost: 2 });
    await send(matchId, { userId: b, score: 30, fours: 3, sixes: 1, wicketsLost: 0 });

    const { totals, leaderboards } = (await view(tid, 'stats')).body.data;
    expect(totals).toMatchObject({ innings: 2, runs: 70, fours: 5, sixes: 5, wicketsLost: 2, highest: 40, inningsWithStats: 2 });
    const names = (list: Array<{ userId: string }>) => list.map((e) => e.userId);
    expect(names(leaderboards.mostSixes)).toEqual([a, b]);
    expect(names(leaderboards.mostFours)).toEqual([b, a]);
    // One innings each: nobody has the 3 needed for the wickets board yet.
    expect(leaderboards.fewestWicketsPerOver).toEqual([]);
    expect(totals).toMatchObject({ wicketInnings: 2, wicketOvers: 2, wicketsPerOver: 1 });
    expect(leaderboards.highestInnings[0]).toMatchObject({ userId: a, value: 40 });
  });
});

describe('player dashboard', () => {
  it('shows career stats, recent form, live tournaments and ones to join', async () => {
    const [a, b] = [await user(), await user()];
    const { tid, matchId } = await liveDrawMatch(a, b);
    const openTid = await tournament({ startsIn: '1 hour' });
    await pool.query(`UPDATE tournaments SET status = 'open' WHERE id = $1`, [openTid]);
    await current(a);
    await request(app).post(`/api/v1/integrations/meta/matches/${matchId}/scores`).set(meta).send({ userId: a, score: 36, fours: 3, sixes: 2, wicketsLost: 1 });
    await request(app).post(`/api/v1/integrations/meta/matches/${matchId}/scores`).set(meta).send({ userId: b, score: 20 });

    const res = await request(app).get('/api/v1/players/me/dashboard').set(auth(a));
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.stats).toMatchObject({ matches: 1, wins: 1, losses: 0, winRate: 100, runs: 36, fours: 3, sixes: 2, wicketsLost: 1, highest: 36, tournamentsPlayed: 1 });
    expect(d.recentForm[0]).toMatchObject({ result: 'W', myScore: 36, opponentScore: 20 });
    expect(d.openTournaments.some((t: { id: string }) => t.id === openTid)).toBe(true);
    expect(d.openTournaments.some((t: { id: string }) => t.id === tid)).toBe(false);
    expect((await request(app).get('/api/v1/players/me/dashboard')).status).toBe(401);
  });
});

describe('player profile stats and global leaderboards', () => {
  it('shows a public career page and all-time boards without bots', async () => {
    const [a, b] = [await user(), await user()];
    const { tid, matchId } = await liveDrawMatch(a, b);
    await current(a);
    await request(app).post(`/api/v1/integrations/meta/matches/${matchId}/scores`).set(meta).send({ userId: a, score: 50, fours: 2, sixes: 6, wicketsLost: 0 });
    await request(app).post(`/api/v1/integrations/meta/matches/${matchId}/scores`).set(meta).send({ userId: b, score: 12, fours: 1, sixes: 0, wicketsLost: 2 });
    const nameA = (await pool.query(`SELECT username FROM users WHERE id = $1`, [a])).rows[0].username;

    const profile = await request(app).get(`/api/v1/players/${nameA}/stats`);
    expect(profile.status).toBe(200);
    expect(profile.body.data.stats).toMatchObject({ matches: 1, wins: 1, sixes: 6, fours: 2, highest: 50 });
    expect(profile.body.data.recentMatches[0]).toMatchObject({ result: 'W', myScore: 50, opponentScore: 12, sixes: 6 });
    expect(profile.body.data.tournaments.find((t: { id: string }) => t.id === tid)).toBeDefined();
    expect((await request(app).get('/api/v1/players/no-such-player-xyz/stats')).status).toBe(404);

    const boards = (await request(app).get('/api/v1/leaderboards')).body.data;
    expect(boards.batting.mostSixes[0].value).toBeGreaterThanOrEqual(6);
    expect(boards.batting.mostSixes.some((e: { userId: string }) => e.userId === a)).toBe(true);
    const bots = await pool.query(`SELECT id FROM users WHERE is_bot`);
    const botIds = new Set(bots.rows.map((r) => r.id));
    for (const list of Object.values(boards.batting) as Array<Array<{ userId: string }>>) {
      expect(list.some((e) => botIds.has(e.userId))).toBe(false);
    }
  });
});
