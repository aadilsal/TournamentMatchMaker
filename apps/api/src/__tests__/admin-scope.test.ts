import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { Redis } from 'ioredis';
import { randomBytes } from 'crypto';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { adminCreateMatchSchema } from '@vr-tournament/shared';
import { createApp } from '../app.js';
import type { Env } from '../config/env.js';
import { placeholderSecrets } from '../config/env.js';
import type { RedisClient } from '../lib/redis.js';
import { AdminUsersService } from '../modules/admin/services/users.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../../.env'), override: true });

// Own database (…_scope_test) so this file can run in parallel with integration.test.ts.
function scopeTestDbUrl(): URL {
  const raw = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL (or TEST_DATABASE_URL) must be set');
  const url = new URL(raw);
  const name = url.pathname.slice(1).replace(/_test$/, '');
  url.pathname = `/${name}_scope_test`;
  return url;
}

const DB_URL = scopeTestDbUrl();

const env = {
  NODE_ENV: 'test',
  PORT: 3000,
  DATABASE_URL: DB_URL.toString(),
  REDIS_URL: process.env.REDIS_URL!,
  JWT_ACCESS_SECRET: 'test-access-secret-minimum-32-characters-long',
  JWT_REFRESH_SECRET: 'test-refresh-secret-minimum-32-characters-long',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '7d',
  CORS_ORIGIN: 'http://localhost:5173',
  NOTIFICATION_EMAIL_ENABLED: true,
  APP_URL: 'http://localhost:5173',
  AWS_ACCESS_KEY_ID: 'sample-aws-access-key',
  AWS_SECRET_ACCESS_KEY: 'sample-aws-secret-key',
  AWS_REGION: 'us-east-1',
  AWS_SES_FROM_EMAIL: 'notifications@pixelpaddle.com',
  META_API_KEY: 'test-meta-api-key-0123456789',
} as unknown as Env;

async function resetDatabase() {
  const admin = new pg.Pool({ connectionString: Object.assign(new URL(DB_URL), { pathname: '/postgres' }).toString() });
  const name = DB_URL.pathname.slice(1);
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
  if (exists.rows.length === 0) await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();

  const pool = new pg.Pool({ connectionString: DB_URL.toString() });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const dir = join(__dirname, '../../../../packages/db/migrations');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(dir, file), 'utf-8');
    await pool.query(sql.split(/^-- (?:Down Migration|migrate:down)/m)[0]!.replace('-- Up Migration', ''));
  }
  await pool.end();
}

describe('admin scope, lifecycle guards and account safety', () => {
  let pool: pg.Pool;
  let redis: RedisClient;
  let app: ReturnType<typeof createApp>;
  const ids: Record<string, string> = {};
  const tokens: Record<string, string> = {};

  const token = (id: string, role: string) =>
    jwt.sign({ sub: id, email: `${id}@t.test`, role, jti: randomBytes(8).toString('hex') }, env.JWT_ACCESS_SECRET, {
      expiresIn: '15m',
    });
  const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
  const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

  async function user(key: string, role: string) {
    const r = await pool.query(
      `INSERT INTO users (email, password_hash, username, role) VALUES ($1, 'x', $2, $3) RETURNING id`,
      [`${key}@t.test`, key, role]
    );
    ids[key] = r.rows[0].id;
    tokens[key] = token(ids[key]!, role);
  }

  async function createTournament(name: string) {
    const res = await request(app)
      .post('/api/v1/admin/tournaments')
      .set(as('superA'))
      .send({ name, game: 'Cricket', startDate: inHours(24), endDate: inHours(24 * 7) });
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  }

  beforeAll(async () => {
    await resetDatabase();
    pool = new pg.Pool({ connectionString: env.DATABASE_URL });
    redis = new Redis(env.REDIS_URL);
    app = createApp(pool, redis, env);

    await user('superA', 'superadmin');
    await user('superB', 'superadmin');
    await user('venueAdmin', 'venue_admin');
    await user('tournAdmin', 'tournament_admin');
    await user('p1', 'player');
    await user('p2', 'player');

    for (const v of ['v1', 'v2']) {
      const r = await pool.query(
        `INSERT INTO venues (name, address, city, country, location, capacity)
         VALUES ($1, 'addr', 'Lahore', 'Pakistan', ST_SetSRID(ST_MakePoint(74.3, 31.5), 4326), 10) RETURNING id`,
        [v]
      );
      ids[v] = r.rows[0].id;
      const s = await pool.query(
        `INSERT INTO time_slots (venue_id, start_time, end_time, max_capacity)
         VALUES ($1, NOW() + INTERVAL '2 days', NOW() + INTERVAL '2 days 1 hour', 4) RETURNING id, start_time, end_time`,
        [ids[v]]
      );
      ids[`${v}slot`] = s.rows[0].id;
    }
    await pool.query(`INSERT INTO bookings (user_id, time_slot_id, status) VALUES ($1, $2, 'confirmed')`, [ids.p1, ids.v1slot]);
    await pool.query(`INSERT INTO bookings (user_id, time_slot_id, status) VALUES ($1, $2, 'confirmed')`, [ids.p2, ids.v2slot]);
    await pool.query(`INSERT INTO venue_admins (user_id, venue_id) VALUES ($1, $2)`, [ids.venueAdmin, ids.v1]);

    ids.t1 = await createTournament('T1');
    ids.t2 = await createTournament('T2');
    await pool.query(`INSERT INTO tournament_admins (user_id, tournament_id) VALUES ($1, $2)`, [ids.tournAdmin, ids.t1]);
    for (const t of ['t1', 't2']) {
      const m = await pool.query(
        `INSERT INTO matches (tournament_id, player1_id, player2_id, status) VALUES ($1, $2, $3, 'in_progress') RETURNING id`,
        [ids[t], ids.p1, ids.p2]
      );
      ids[`${t}match`] = m.rows[0].id;
    }
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    await redis?.quit();
  });

  describe('C2 scope', () => {
    it('removes the public create routes', async () => {
      expect((await request(app).post('/api/v1/venues').set(as('venueAdmin')).send({})).status).toBe(404);
      expect((await request(app).post(`/api/v1/venues/${ids.v2}/slots`).set(as('venueAdmin')).send({})).status).toBe(404);
      expect((await request(app).post('/api/v1/tournaments').set(as('tournAdmin')).send({})).status).toBe(404);
    });

    it('venue admin only sees their venue bookings and slots, and no tournaments', async () => {
      const bookings = await request(app).get('/api/v1/admin/bookings').set(as('venueAdmin'));
      expect(bookings.status).toBe(200);
      expect(bookings.body.data.map((b: { venueId: string }) => b.venueId)).toEqual([ids.v1]);
      expect((await request(app).get(`/api/v1/admin/bookings?venueId=${ids.v2}`).set(as('venueAdmin'))).status).toBe(403);

      const slots = await request(app).get('/api/v1/admin/slots').set(as('venueAdmin'));
      expect(slots.body.data.map((s: { id: string }) => s.id)).toEqual([ids.v1slot]);
      expect((await request(app).get(`/api/v1/admin/slots?venueId=${ids.v2}`).set(as('venueAdmin'))).status).toBe(403);

      const tournaments = await request(app).get('/api/v1/admin/tournaments').set(as('venueAdmin'));
      expect(tournaments.body.data).toEqual([]);

      const dash = await request(app).get('/api/v1/admin/dashboard').set(as('venueAdmin'));
      expect(dash.body.data.venues).toBe(1);
      expect(dash.body.data.bookings.confirmed).toBe(1);
      expect(dash.body.data.tournaments.draft).toBe(0);
    });

    it('tournament admin only sees their tournament, its matches, and no bookings or notifications', async () => {
      const t = await request(app).get('/api/v1/admin/tournaments').set(as('tournAdmin'));
      expect(t.body.data.map((x: { id: string }) => x.id)).toEqual([ids.t1]);

      const m = await request(app).get('/api/v1/admin/matches').set(as('tournAdmin'));
      expect(m.status).toBe(200);
      expect(m.body.data.map((x: { id: string }) => x.id)).toEqual([ids.t1match]);
      expect((await request(app).get(`/api/v1/admin/matches?tournamentId=${ids.t2}`).set(as('tournAdmin'))).status).toBe(403);

      expect((await request(app).get('/api/v1/admin/bookings').set(as('tournAdmin'))).body.data).toEqual([]);
      expect((await request(app).get('/api/v1/admin/notifications').set(as('tournAdmin'))).status).toBe(403);
    });

    it('superadmin still sees everything', async () => {
      const m = await request(app).get('/api/v1/admin/matches').set(as('superA'));
      expect(m.body.data).toHaveLength(2);
      const b = await request(app).get('/api/v1/admin/bookings').set(as('superA'));
      expect(b.body.data).toHaveLength(2);
    });

    it('registrations show player emails to superadmins only', async () => {
      await pool.query(`INSERT INTO tournament_registrations (tournament_id, user_id) VALUES ($1, $2)`, [ids.t1, ids.p1]);
      const url = `/api/v1/admin/tournaments/${ids.t1}/registrations`;
      const scoped = await request(app).get(url).set(as('tournAdmin'));
      expect(scoped.body.data).toHaveLength(1);
      expect(scoped.body.data[0].username).toBe('p1');
      expect(scoped.body.data[0]).not.toHaveProperty('email');
      expect((await request(app).get(url).set(as('superA'))).body.data[0].email).toBe('p1@t.test');
    });

    it('dashboard match counts equal the list each card opens', async () => {
      const dash = (await request(app).get('/api/v1/admin/dashboard').set(as('superA'))).body.data;
      for (const view of ['ongoing', 'upcoming', 'past'] as const) {
        const list = await request(app).get(`/api/v1/admin/matches?view=${view}&limit=100`).set(as('superA'));
        expect(list.body.data).toHaveLength(dash.matches[view]);
      }
      expect(dash.matches.ongoing).toBe(2);
    });
  });

  describe('C5 tournament lifecycle', () => {
    it('refuses to start a draft', async () => {
      const res = await request(app).post(`/api/v1/admin/tournaments/${ids.t1}/start`).set(as('superA'));
      expect(res.status).toBe(409);
    });

    it('walks the allowed path, settles on complete, and cannot be reopened', async () => {
      const step = (action: string) =>
        request(app).post(`/api/v1/admin/tournaments/${ids.t2}/${action}`).set(as('superA'));
      expect((await step('publish')).status).toBe(200);
      expect((await step('close-registration')).status).toBe(200);
      expect((await step('start')).status).toBe(409);
      await pool.query(`INSERT INTO tournament_registrations (tournament_id, user_id) VALUES ($1, $2)`, [ids.t2, ids.p1]);
      expect((await step('start')).status).toBe(200);
      expect((await step('complete')).status).toBe(200);

      const match = await pool.query(`SELECT status FROM matches WHERE id = $1`, [ids.t2match]);
      expect(match.rows[0].status).toBe('expired');
      const open = await pool.query(
        `SELECT COUNT(*)::int AS c FROM tournament_rounds WHERE tournament_id = $1 AND status = 'active'`,
        [ids.t2]
      );
      expect(open.rows[0].c).toBe(0);

      expect((await step('publish')).status).toBe(409);
      expect((await step('start')).status).toBe(409);
      const edit = await request(app)
        .patch(`/api/v1/admin/tournaments/${ids.t2}`)
        .set(as('superA'))
        .send({ status: 'open' });
      expect(edit.status).toBe(409);
    });

    it('refuses to delete a tournament that has matches, deletes an empty one', async () => {
      const blocked = await request(app).delete(`/api/v1/admin/tournaments/${ids.t1}`).set(as('superA'));
      expect(blocked.status).toBe(409);
      expect(blocked.body.error.message).toMatch(/matches or buybacks/);

      const empty = await createTournament('T3');
      expect((await request(app).delete(`/api/v1/admin/tournaments/${empty}`).set(as('superA'))).status).toBe(200);
    });
  });

  describe('C4 superadmin safety', () => {
    it('blocks changing your own role or suspending yourself', async () => {
      const role = await request(app).patch(`/api/v1/admin/users/${ids.superA}`).set(as('superA')).send({ role: 'player' });
      expect(role.status).toBe(409);
      const suspend = await request(app).patch(`/api/v1/admin/users/${ids.superA}`).set(as('superA')).send({ suspended: true });
      expect(suspend.status).toBe(409);
    });

    it('never leaves zero active superadmins', async () => {
      const demote = await request(app).patch(`/api/v1/admin/users/${ids.superB}`).set(as('superA')).send({ role: 'player' });
      expect(demote.status).toBe(200);
      // Only reachable from a non-superadmin actor, so exercised on the service directly.
      const service = new AdminUsersService(pool);
      await expect(service.update(ids.p1!, ids.superA!, { role: 'player' })).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('H1 slot validation', () => {
    const slot = (startH: number, endH: number, maxCapacity = 2) => ({
      startTime: inHours(startH),
      endTime: inHours(endH),
      maxCapacity,
    });
    const post = (slots: unknown[]) =>
      request(app).post(`/api/v1/admin/venues/${ids.v1}/slots`).set(as('venueAdmin')).send({ slots });

    it('rejects bad input', async () => {
      expect((await post([slot(10, 9)])).status).toBe(400);
      expect((await post([slot(-2, -1)])).status).toBe(400);
      expect((await post([slot(10, 11, 1_000_000)])).status).toBe(400);
      expect((await post([slot(10, 12), slot(11, 13)])).status).toBe(400);
      expect((await post(Array.from({ length: 201 }, (_, i) => slot(100 + i, 100.5 + i)))).status).toBe(400);
    });

    it('rejects overlap with an existing slot but accepts an adjacent one', async () => {
      expect((await post([slot(10, 11)])).status).toBe(201);
      expect((await post([slot(10.5, 11.5)])).status).toBe(409);
      expect((await post([slot(11, 12)])).status).toBe(201);
    });
  });

  describe('M15 deletes', () => {
    it('refuses to delete a venue with bookings', async () => {
      const res = await request(app).delete(`/api/v1/admin/venues/${ids.v2}`).set(as('superA'));
      expect(res.status).toBe(409);
      expect(res.body.error.message).toMatch(/deactivate/);
    });

    it('anonymises a user who has history instead of failing', async () => {
      const res = await request(app).delete(`/api/v1/admin/users/${ids.p2}`).set(as('superA'));
      expect(res.status).toBe(200);
      expect(res.body.data.anonymised).toBe(true);
      const row = await pool.query(`SELECT email, suspended_at FROM users WHERE id = $1`, [ids.p2]);
      expect(row.rows[0].email).toMatch(/@deleted\.invalid$/);
      expect(row.rows[0].suspended_at).not.toBeNull();
    });
  });

  describe('H14 password reset', () => {
    it('emails a single-use link and resets the password', async () => {
      const reg = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'reset@t.test', password: 'oldpass123', username: 'resetme' });
      expect(reg.status).toBe(201);

      const log = jest.spyOn(console, 'log').mockImplementation(() => {});
      expect((await request(app).post('/api/v1/auth/forgot-password').send({ email: 'nobody@t.test' })).body.success).toBe(true);
      const sent = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'Reset@T.test' });
      expect(sent.status).toBe(200);

      let tokenValue: string | undefined;
      for (let i = 0; i < 50 && !tokenValue; i++) {
        await new Promise((r) => setTimeout(r, 50));
        const line = log.mock.calls.map((c) => String(c[0])).find((l) => l.includes('reset-password?token='));
        tokenValue = line?.match(/token=([a-f0-9]+)/)?.[1];
      }
      log.mockRestore();
      expect(tokenValue).toBeDefined();

      const reset = (password: string) =>
        request(app).post('/api/v1/auth/reset-password').send({ token: tokenValue, password });
      expect((await reset('12345678')).status).toBe(400);
      expect((await reset('newpass456')).status).toBe(200);

      const again = await reset('another789');
      expect(again.status).toBe(400);
      expect(again.body.error.message).toBe('This reset link is invalid or has expired');

      expect((await request(app).post('/api/v1/auth/login').send({ email: 'reset@t.test', password: 'oldpass123' })).status).toBe(401);
      expect((await request(app).post('/api/v1/auth/login').send({ email: 'reset@t.test', password: 'newpass456' })).status).toBe(200);
    });
  });
});

describe('schema and config guards', () => {
  it('M3: a match needs two different players', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    expect(adminCreateMatchSchema.safeParse({ player1Id: id, player2Id: id }).success).toBe(false);
  });

  it('H7: production refuses placeholder secrets, development does not', () => {
    const base = {
      META_API_KEY: 'sample-meta-api-key-change-me',
      JWT_ACCESS_SECRET: 'dev-access-secret-change-in-production-32chars',
      JWT_REFRESH_SECRET: 'a'.repeat(40),
    };
    expect(placeholderSecrets({ ...base, NODE_ENV: 'production' } as unknown as Env)).toEqual([
      'META_API_KEY',
      'JWT_ACCESS_SECRET',
    ]);
    expect(placeholderSecrets({ ...base, NODE_ENV: 'development' } as unknown as Env)).toEqual([]);
  });
});
