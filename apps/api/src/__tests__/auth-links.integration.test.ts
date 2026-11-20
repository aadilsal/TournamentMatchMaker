import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import pg from 'pg';
import { Redis } from 'ioredis';
import request from 'supertest';
import { createHash, randomBytes } from 'crypto';
import { readFileSync, readdirSync } from 'fs';
import { dirname, join as joinPath, resolve } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import type { Env } from '../config/env.js';

// Email sign-in links, auto sign-in after a password reset, and session length by role.

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../../.env'), override: true });

const DB_URL = (() => {
  const raw = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!raw) throw new Error('TEST_DATABASE_URL must be set');
  const url = new URL(raw);
  url.pathname = `/${url.pathname.slice(1).replace(/_test$/, '')}_auth_links_test`;
  return url.toString();
})();
const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
redisUrl.pathname = '/8';

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
  NOTIFICATION_EMAIL_ENABLED: false,
  APP_URL: 'http://localhost:5173',
  META_API_KEY: 'auth-links-meta-key-1234567',
  STRIPE_SECRET_KEY: 'sk_test_links',
  STRIPE_WEBHOOK_SECRET: 'whsec_links',
} as unknown as Env;

const DAY_S = 24 * 60 * 60;
const sha = (t: string) => createHash('sha256').update(t).digest('hex');

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
async function user(opts: { role?: string; suspended?: boolean } = {}) {
  seq++;
  const r = await pool.query(
    `INSERT INTO users (email, password_hash, username, role, suspended_at)
     VALUES ($1, 'x', $2, $3, $4) RETURNING id`,
    [`l${seq}@t.test`, `linker${seq}`, opts.role ?? 'player', opts.suspended ? new Date() : null]
  );
  return { id: r.rows[0].id as string, username: `linker${seq}` };
}

async function loginLink(userId: string, expiresIn = '30 minutes') {
  const token = randomBytes(32).toString('hex');
  await pool.query(
    `INSERT INTO login_links (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + $3::interval)`,
    [userId, sha(token), expiresIn]
  );
  return token;
}

async function resetLink(userId: string) {
  const token = randomBytes(32).toString('hex');
  await pool.query(
    `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
    [userId, sha(token)]
  );
  return token;
}

const cookieMaxAge = (res: request.Response) => {
  const raw = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('refresh_token='));
  return raw ? Number(/Max-Age=(\d+)/.exec(raw)?.[1]) : null;
};

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

describe('email sign-in links', () => {
  it('shows who the link is for, signs in once with a 30-day session, then refuses reuse', async () => {
    const me = await user();
    const token = await loginLink(me.id);

    const peek = await request(app).post('/api/v1/auth/login-link/peek').send({ token });
    expect(peek.status).toBe(200);
    expect(peek.body.data).toEqual({ username: me.username });

    const redeem = await request(app).post('/api/v1/auth/login-link').send({ token });
    expect(redeem.status).toBe(200);
    expect(redeem.body.data.user.id).toBe(me.id);
    expect(cookieMaxAge(redeem)).toBe(30 * DAY_S);

    const profile = await request(app)
      .get('/api/v1/players/me')
      .set('Authorization', `Bearer ${redeem.body.data.accessToken}`);
    expect(profile.status).toBe(200);

    const again = await request(app).post('/api/v1/auth/login-link').send({ token });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('INVALID_LOGIN_LINK');
  });

  it('refuses expired links, admins, suspended players and unknown tokens', async () => {
    const expired = await loginLink((await user()).id, '-1 minute');
    const admin = await loginLink((await user({ role: 'tournament_admin' })).id);
    const suspended = await loginLink((await user({ suspended: true })).id);
    for (const token of [expired, admin, suspended, 'not-a-real-token']) {
      const peek = await request(app).post('/api/v1/auth/login-link/peek').send({ token });
      const redeem = await request(app).post('/api/v1/auth/login-link').send({ token });
      expect([peek.status, redeem.status]).toEqual([400, 400]);
    }
  });
});

describe('password reset', () => {
  it('signs the player straight in and kills outstanding sign-in links', async () => {
    const me = await user();
    const link = await loginLink(me.id);
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: await resetLink(me.id), password: 'BrandNew#Pass123' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(me.id);
    expect(cookieMaxAge(res)).toBe(30 * DAY_S);

    // Minted right after the revocation marker, yet still accepted.
    const profile = await request(app)
      .get('/api/v1/players/me')
      .set('Authorization', `Bearer ${res.body.data.accessToken}`);
    expect(profile.status).toBe(200);

    const reuse = await request(app).post('/api/v1/auth/login-link').send({ token: link });
    expect(reuse.status).toBe(400);
  });

  it('gives admins a 7-day session', async () => {
    const admin = await user({ role: 'tournament_admin' });
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: await resetLink(admin.id), password: 'BrandNew#Pass123' });
    expect(res.status).toBe(200);
    expect(cookieMaxAge(res)).toBe(7 * DAY_S);
  });
});
