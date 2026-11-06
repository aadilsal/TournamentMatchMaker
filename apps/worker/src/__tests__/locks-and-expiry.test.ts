import { afterAll, describe, expect, it } from '@jest/globals';
import pg from 'pg';
import { Redis } from 'ioredis';
import type { Job } from 'bullmq';
import { acquireLock, lockPlayersForMatch, releaseLock } from '../lib/redlock.js';
import { processExpireMatchesJob } from '../jobs/expire-matches.job.js';

// H3 pair lock + per-player DB lock, M13 expire guard.

const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
redisUrl.pathname = '/5';
const redis = new Redis(redisUrl.toString());
const dbUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

afterAll(async () => {
  await redis.quit();
});

describe('pair lock', () => {
  it('only the owner can release it', async () => {
    const key = `test:lock:${Date.now()}`;
    const token = await acquireLock(redis, key);
    expect(token).not.toBeNull();
    expect(await acquireLock(redis, key)).toBeNull();

    await releaseLock(redis, key, 'someone-else');
    expect(await redis.get(key)).toBe(token);

    await releaseLock(redis, key, token!);
    expect(await redis.get(key)).toBeNull();
  });
});

(dbUrl ? describe : describe.skip)('per-player match lock', () => {
  it('a second pairing for the same player waits for the first to commit', async () => {
    const pool = new pg.Pool({ connectionString: dbUrl });
    const [a, b] = [await pool.connect(), await pool.connect()];
    try {
      const order: string[] = [];
      await a.query('BEGIN');
      await lockPlayersForMatch(a, ['p-2', 'p-1']);
      await b.query('BEGIN');
      const second = lockPlayersForMatch(b, ['p-1', 'p-3']).then(() => order.push('second'));
      await new Promise((r) => setTimeout(r, 200));
      order.push('first-commit');
      await a.query('COMMIT');
      await second;
      await b.query('COMMIT');
      expect(order).toEqual(['first-commit', 'second']);
    } finally {
      a.release();
      b.release();
      await pool.end();
    }
  });
});

describe('expire-matches', () => {
  it('leaves a match alone once it was confirmed after the scan', async () => {
    const queries: string[] = [];
    const client = {
      query: async (sql: string) => {
        queries.push(sql.trim().split(/\s+/).slice(0, 2).join(' '));
        if (sql.includes('SELECT m.*')) {
          return { rows: [{ id: 'm1', player1_id: 'a', player2_id: 'b', time_slot_id: 's1' }] };
        }
        return { rows: [], rowCount: 0 };
      },
      release: () => {},
    };
    const added: unknown[] = [];
    await processExpireMatchesJob(
      {} as Job,
      { connect: async () => client } as unknown as pg.Pool,
      redis,
      { add: async (...args: unknown[]) => added.push(args) }
    );
    expect(added).toHaveLength(0);
    expect(queries).not.toContain('UPDATE time_slots');
    expect(queries).toContain('ROLLBACK');
  });
});
