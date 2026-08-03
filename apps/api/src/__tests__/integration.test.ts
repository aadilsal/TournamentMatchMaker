import request from 'supertest';
import pg from 'pg';
import { Redis } from 'ioredis';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { resolve } from 'path';
import { createApp } from '../app.js';
import type { RedisClient } from '../lib/redis.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: resolve(__dirname, '../../../../.env'), override: true });

/**
 * These tests DROP every table before running, so they must never touch the
 * database a developer is working in. Point them at a dedicated database —
 * TEST_DATABASE_URL if provided, otherwise `<dbname>_test` derived from
 * DATABASE_URL — and refuse to run anywhere whose name does not end in `_test`.
 * `pnpm test` used to wipe the seeded dev database on every run.
 */
function resolveTestDatabaseUrl(): URL {
  const raw = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL (or TEST_DATABASE_URL) must be set for integration tests');

  const url = new URL(raw);
  if (!process.env.TEST_DATABASE_URL) {
    const name = url.pathname.replace(/^\//, '');
    url.pathname = `/${name}${name.endsWith('_test') ? '' : '_test'}`;
  }
  if (!url.pathname.replace(/^\//, '').endsWith('_test')) {
    throw new Error(
      `Refusing to run destructive integration tests against "${url.pathname.slice(1)}" — ` +
        'the database name must end in `_test`.'
    );
  }
  return url;
}

const TEST_DB_URL = resolveTestDatabaseUrl();

/** Creates the test database if it does not exist yet. */
async function ensureTestDatabase(url: URL) {
  const dbName = url.pathname.replace(/^\//, '');
  const adminUrl = new URL(url.toString());
  adminUrl.pathname = '/postgres';

  const admin = new pg.Pool({ connectionString: adminUrl.toString() });
  try {
    const { rows } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (rows.length === 0) {
      await admin.query(`CREATE DATABASE "${dbName}"`);
    }
  } finally {
    await admin.end();
  }
}

const mockEnv = {
  NODE_ENV: 'test' as const,
  PORT: 3000,
  DATABASE_URL: TEST_DB_URL.toString(),
  REDIS_URL: process.env.REDIS_URL!,
  JWT_ACCESS_SECRET: 'test-access-secret-minimum-32-characters-long',
  JWT_REFRESH_SECRET: 'test-refresh-secret-minimum-32-characters-long',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '7d',
  CORS_ORIGIN: 'http://localhost:5173',
  RESEND_FROM_EMAIL: 'notifications@vrtournament.com',
  NOTIFICATION_EMAIL_ENABLED: true,
  APP_URL: 'http://localhost:5173',
};

async function runMigrations(connectionString: string) {
  const pool = new pg.Pool({ connectionString });
  const migrationsDir = join(__dirname, '../../../../packages/db/migrations');
  // Read the directory rather than listing files by hand: a hand-maintained list
  // silently omits every migration added after it was last touched, and the app
  // then fails on any request touching the missing columns.
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  await pool.query('DROP TABLE IF EXISTS audit_logs CASCADE');
  await pool.query('DROP TABLE IF EXISTS venue_admins CASCADE');
  await pool.query('DROP TABLE IF EXISTS tournament_admins CASCADE');
  await pool.query('DROP TABLE IF EXISTS tournament_round_slots CASCADE');
  await pool.query('DROP TABLE IF EXISTS buybacks CASCADE');
  await pool.query('DROP TABLE IF EXISTS tournament_participants CASCADE');
  await pool.query('DROP TABLE IF EXISTS tournament_rounds CASCADE');
  await pool.query('DROP TABLE IF EXISTS notifications CASCADE');
  await pool.query('DROP TYPE IF EXISTS notification_status CASCADE');
  await pool.query('DROP TYPE IF EXISTS notification_channel CASCADE');
  await pool.query('DROP TABLE IF EXISTS matches CASCADE');
  await pool.query('DROP TABLE IF EXISTS tournament_registrations CASCADE');
  await pool.query('DROP TABLE IF EXISTS tournaments CASCADE');
  await pool.query('DROP TYPE IF EXISTS match_status CASCADE');
  await pool.query('DROP TYPE IF EXISTS tournament_format CASCADE');
  await pool.query('DROP TYPE IF EXISTS tournament_status CASCADE');
  await pool.query('DROP TABLE IF EXISTS bookings CASCADE');
  await pool.query('DROP TABLE IF EXISTS time_slots CASCADE');
  await pool.query('DROP TYPE IF EXISTS booking_status CASCADE');
  await pool.query('DROP TYPE IF EXISTS slot_status CASCADE');
  await pool.query('DROP TABLE IF EXISTS venues CASCADE');
  await pool.query('DROP TABLE IF EXISTS refresh_tokens CASCADE');
  await pool.query('DROP TABLE IF EXISTS users CASCADE');
  await pool.query('DROP TABLE IF EXISTS pgmigrations CASCADE');

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf-8');
    // Migration files mark the reverse section with either marker.
    const upSection = sql
      .split(/^-- (?:Down Migration|migrate:down)/m)[0]
      .replace('-- Up Migration', '')
      .trim();
    await pool.query(upSection);
  }

  await pool.end();
}

describe('API Integration', () => {
  let pool: pg.Pool;
  let redis: RedisClient;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    if (!mockEnv.DATABASE_URL || !mockEnv.REDIS_URL) {
      throw new Error('DATABASE_URL and REDIS_URL must be set for integration tests');
    }

    await ensureTestDatabase(TEST_DB_URL);
    await runMigrations(mockEnv.DATABASE_URL);

    pool = new pg.Pool({ connectionString: mockEnv.DATABASE_URL });
    redis = new Redis(mockEnv.REDIS_URL);
    app = createApp(pool, redis, mockEnv);
  }, 60000);

  afterAll(async () => {
    await pool?.end();
    await redis?.quit();
  });

  let accessToken: string;
  let venueId: string;
  let slotId: string;

  it('should register a new user', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'integration@test.com',
        password: 'password123',
        username: 'integuser',
        city: 'Lahore',
        country: 'Pakistan',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    accessToken = res.body.data.accessToken;
  });

  it('should login existing user', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'integration@test.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    accessToken = res.body.data.accessToken;
  });

  it('should get player profile', async () => {
    const res = await request(app)
      .get('/api/v1/players/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.username).toBe('integuser');
  });

  it('should create a venue as superadmin', async () => {
    await pool.query("UPDATE users SET role = 'superadmin' WHERE email = 'integration@test.com'");

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'integration@test.com', password: 'password123' });
    accessToken = loginRes.body.data.accessToken;

    const res = await request(app)
      .post('/api/v1/venues')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Test VR Arena',
        address: '123 Test St',
        city: 'Lahore',
        country: 'Pakistan',
        latitude: 31.5204,
        longitude: 74.3587,
        capacity: 2,
      });

    expect(res.status).toBe(201);
    venueId = res.body.data.id;
  });

  it('should create time slots', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(14, 0, 0, 0);
    const end = new Date(tomorrow);
    end.setHours(15, 0, 0, 0);

    const res = await request(app)
      .post(`/api/v1/venues/${venueId}/slots`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        slots: [{
          startTime: tomorrow.toISOString(),
          endTime: end.toISOString(),
          maxCapacity: 1,
        }],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.length).toBe(1);
    slotId = res.body.data[0].id;
  });

  it('should book a slot', async () => {
    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ timeSlotId: slotId });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('confirmed');
  });

  it('should reject booking when slot is full', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'player2@test.com',
        password: 'password123',
        username: 'player2',
      });

    const token2 = res.body.data.accessToken;

    const bookRes = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${token2}`)
      .send({ timeSlotId: slotId });

    expect(bookRes.status).toBe(409);
  });

  it('should handle concurrent booking attempts - only one succeeds', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 2);
    tomorrow.setHours(16, 0, 0, 0);
    const end = new Date(tomorrow);
    end.setHours(17, 0, 0, 0);

    const slotRes = await request(app)
      .post(`/api/v1/venues/${venueId}/slots`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        slots: [{
          startTime: tomorrow.toISOString(),
          endTime: end.toISOString(),
          maxCapacity: 1,
        }],
      });

    const concurrentSlotId = slotRes.body.data[0].id;

    const user3 = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'player3@test.com', password: 'password123', username: 'player3' });

    const user4 = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'player4@test.com', password: 'password123', username: 'player4' });

    const [res1, res2] = await Promise.all([
      request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${user3.body.data.accessToken}`)
        .send({ timeSlotId: concurrentSlotId }),
      request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${user4.body.data.accessToken}`)
        .send({ timeSlotId: concurrentSlotId }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([201, 409]);
  });

  it('lists tournaments', async () => {
    const res = await request(app).get('/api/v1/tournaments');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('joins and leaves matchmaking queue', async () => {
    const join = await request(app)
      .post('/api/v1/matchmaking/queue')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});
    expect(join.status).toBe(201);
    expect(join.body.data.inQueue).toBe(true);

    const leave = await request(app)
      .delete('/api/v1/matchmaking/queue')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(leave.body.data.inQueue).toBe(false);
  });
});
