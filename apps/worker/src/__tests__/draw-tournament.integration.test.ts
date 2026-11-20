import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import pg from 'pg';
import { Redis } from 'ioredis';
import { readFileSync, readdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { generateBotInnings } from '@vr-tournament/shared';
import { processDrawRoundsJob, recordDrawResult, sendDrawReminders } from '../jobs/draw-rounds.job.js';

// Full draw-format tournaments, round by round, against a real database.

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../../.env') });

const baseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const DB_URL = (() => {
  if (!baseUrl) return null;
  const url = new URL(baseUrl);
  url.pathname = `/${url.pathname.slice(1).replace(/_test$/, '')}_draw_test`;
  return url.toString();
})();
const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
redisUrl.pathname = '/6';

let pool: pg.Pool;
let redis: Redis;
const sent: Array<{ userId: string; type: string; payload?: unknown }> = [];
const queue = {
  add: async (_name: string, data: unknown) => {
    sent.push(data as { userId: string; type: string; payload?: unknown });
  },
};

async function resetDatabase(url: string) {
  const admin = new URL(url);
  const dbName = admin.pathname.slice(1);
  admin.pathname = '/postgres';
  const a = new pg.Pool({ connectionString: admin.toString() });
  try {
    const exists = await a.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (!exists.rows[0]) await a.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await a.end();
  }
  const db = new pg.Pool({ connectionString: url });
  try {
    await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    const dir = join(__dirname, '../../../../packages/db/migrations');
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      const up = readFileSync(join(dir, file), 'utf-8').split(/^-- Down Migration/m)[0];
      await db.query(up);
    }
  } finally {
    await db.end();
  }
}

let seq = 0;
async function player(rating = 650) {
  seq++;
  const r = await pool.query(
    `INSERT INTO users (email, password_hash, username, has_vr_headset, rating_points)
     VALUES ($1, 'x', $2, TRUE, $3) RETURNING id`,
    [`p${seq}@t.test`, `player${seq}`, rating]
  );
  return r.rows[0].id as string;
}

async function drawTournament(name: string, roundMinutes = 60, buybackCents = 500, startsIn = '-1 second') {
  const r = await pool.query(
    `INSERT INTO tournaments (name, game, start_date, end_date, status, phase, play_format, round_duration_minutes, buyback_price_cents)
     VALUES ($1, 'VR Cricket', NOW() + $4::interval, NOW() + INTERVAL '30 days', 'open', 'draw', 'draw', $2, $3)
     RETURNING id`,
    [name, roundMinutes, buybackCents, startsIn]
  );
  return r.rows[0].id as string;
}

async function enter(tid: string, uid: string) {
  await pool.query(
    `INSERT INTO tournament_registrations (tournament_id, user_id, play_location) VALUES ($1, $2, 'home')`,
    [tid, uid]
  );
  await pool.query(
    `INSERT INTO tournament_participants (tournament_id, user_id, status, round_number) VALUES ($1, $2, 'active', 1)`,
    [tid, uid]
  );
}

const run = () => processDrawRoundsJob(null, pool, redis, queue);
const tournamentRow = async (tid: string) =>
  (await pool.query(`SELECT * FROM tournaments WHERE id = $1`, [tid])).rows[0];

async function openMatches(tid: string) {
  const r = await pool.query(
    `SELECT m.id, m.player1_id, m.player2_id, m.round_number, p2.is_bot AS p2_bot
     FROM matches m JOIN tournaments t ON t.id = m.tournament_id AND m.round_number = t.current_round_number
     JOIN users p2 ON p2.id = m.player2_id
     WHERE m.tournament_id = $1 AND m.status = 'confirmed'
     ORDER BY m.bracket_slot`,
    [tid]
  );
  return r.rows;
}

async function bat(matchId: string, userId: string, score: number, secondsAgo: number) {
  await pool.query(
    `INSERT INTO match_innings (match_id, user_id, score, source, played_at)
     VALUES ($1, $2, $3, 'meta', NOW() - make_interval(secs => $4))`,
    [matchId, userId, score, secondsAgo]
  );
}

const closeRoundNow = (tid: string) =>
  pool.query(
    `UPDATE tournament_rounds SET ends_at = NOW() - INTERVAL '1 second'
     WHERE tournament_id = $1 AND status = 'active'`,
    [tid]
  );

/** Plays every open match of the current round; `noShow` decides which humans skip. */
async function playRound(tid: string, noShow: (uid: string) => boolean = () => false) {
  for (const m of await openMatches(tid)) {
    const s1 = noShow(m.player1_id) ? null : 5 + Math.floor(Math.random() * 30);
    if (s1 != null) await bat(m.id, m.player1_id, s1, 60);
    if (m.p2_bot) {
      if (s1 != null) await bat(m.id, m.player2_id, generateBotInnings({ opponentScore: s1 }), 30);
    } else if (!noShow(m.player2_id)) {
      await bat(m.id, m.player2_id, 5 + Math.floor(Math.random() * 30), 30);
    }
  }
}

/** Drives a tournament to the end, asserting the draw is sound every round. */
async function playToTheEnd(tid: string, noShow?: (uid: string) => boolean) {
  await run();
  const fields: number[] = [];
  for (let guard = 0; guard < 12; guard++) {
    const t = await tournamentRow(tid);
    if (t.status === 'completed') return { t, fields };
    expect(t.status).toBe('in_progress');

    const matches = await openMatches(tid);
    const humans = matches.flatMap((m) => (m.p2_bot ? [m.player1_id] : [m.player1_id, m.player2_id]));
    // Every human still in is drawn exactly once, and an odd field gets exactly one bot seat.
    expect(new Set(humans).size).toBe(humans.length);
    expect(matches.filter((m) => m.p2_bot).length).toBe(humans.length % 2);
    const field = await pool.query(
      `SELECT COUNT(*)::int AS n FROM tournament_participants tp JOIN users u ON u.id = tp.user_id
       WHERE tp.tournament_id = $1 AND tp.status = 'active' AND tp.round_number = $2 AND u.is_bot = FALSE`,
      [tid, t.current_round_number]
    );
    expect(humans.length).toBe(field.rows[0].n);
    expect(matches.length).toBe(Math.ceil(humans.length / 2));
    fields.push(humans.length);

    await playRound(tid, noShow);
    await closeRoundNow(tid);
    await run();
  }
  throw new Error('tournament did not finish');
}

(DB_URL ? describe : describe.skip)('draw-format tournament engine', () => {
  beforeAll(async () => {
    await resetDatabase(DB_URL!);
    pool = new pg.Pool({ connectionString: DB_URL! });
    redis = new Redis(redisUrl.toString());
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await redis?.quit();
  });

  for (const size of [8, 9, 31, 32]) {
    it(`plays ${size} players down to one champion`, async () => {
      const tid = await drawTournament(`Full ${size}`);
      const ids: string[] = [];
      for (let i = 0; i < size; i++) {
        const id = await player(500 + i * 10);
        ids.push(id);
        await enter(tid, id);
      }

      const { t, fields } = await playToTheEnd(tid);

      expect(t.status).toBe('completed');
      expect(ids).toContain(t.champion_id);
      // Bots never advance, so each round keeps half the field (an odd one maybe one fewer).
      for (let i = 1; i < fields.length; i++) {
        expect(fields[i]).toBeLessThanOrEqual(Math.ceil(fields[i - 1] / 2));
        expect(fields[i]).toBeGreaterThanOrEqual(Math.floor(fields[i - 1] / 2));
      }
      expect(fields.length).toBeLessThanOrEqual(Math.ceil(Math.log2(size)));
      expect(fields.length).toBeGreaterThanOrEqual(Math.floor(Math.log2(size)));
      const live = await pool.query(
        `SELECT COUNT(*)::int AS n FROM matches WHERE tournament_id = $1 AND status IN ('confirmed', 'in_progress')`,
        [tid]
      );
      expect(live.rows[0].n).toBe(0);
    }, 120_000);
  }

  it('knocks out no-shows and still finishes', async () => {
    const tid = await drawTournament('No-shows');
    const ids: string[] = [];
    for (let i = 0; i < 9; i++) {
      const id = await player();
      ids.push(id);
      await enter(tid, id);
    }
    const absent = new Set(ids.slice(0, 3));
    const { t } = await playToTheEnd(tid, (uid) => absent.has(uid));

    expect(t.status).toBe('completed');
    expect(absent.has(t.champion_id)).toBe(false);
    for (const uid of absent) {
      const won = await pool.query(
        `SELECT COUNT(*)::int AS n FROM matches WHERE tournament_id = $1 AND result->>'winnerId' = $2`,
        [tid, uid]
      );
      expect(won.rows[0].n).toBe(0);
    }
  }, 120_000);

  it('settles a round-close tie for whoever batted first', async () => {
    const tid = await drawTournament('Tie');
    const [a, b] = [await player(), await player()];
    await enter(tid, a);
    await enter(tid, b);
    await run();
    const [m] = await openMatches(tid);
    await bat(m.id, b, 20, 120);
    await bat(m.id, a, 20, 10);
    await closeRoundNow(tid);
    await run();
    expect((await tournamentRow(tid)).champion_id).toBe(b);
  });

  it('ends with no champion when nobody plays the final', async () => {
    const tid = await drawTournament('Empty final');
    await enter(tid, await player());
    await enter(tid, await player());
    await run();
    await closeRoundNow(tid);
    await run();
    const t = await tournamentRow(tid);
    expect(t.status).toBe('completed');
    expect(t.champion_id).toBeNull();
  });

  it('finishes at once with one entrant, and with none', async () => {
    const solo = await drawTournament('Solo');
    const only = await player();
    await enter(solo, only);
    const empty = await drawTournament('Empty');
    await run();
    expect((await tournamentRow(solo)).champion_id).toBe(only);
    expect((await tournamentRow(empty)).status).toBe('completed');
  });

  it('runs two tournaments for the same player independently', async () => {
    const shared = await player(900);
    const [t1, t2] = [await drawTournament('Twin A'), await drawTournament('Twin B')];
    for (const tid of [t1, t2]) {
      await enter(tid, shared);
      for (let i = 0; i < 3; i++) await enter(tid, await player());
    }
    await run();
    const m1 = (await openMatches(t1)).find((m) => [m.player1_id, m.player2_id].includes(shared));
    const m2 = (await openMatches(t2)).find((m) => [m.player1_id, m.player2_id].includes(shared));
    expect(m1).toBeDefined();
    expect(m2).toBeDefined();
    expect(m1!.id).not.toBe(m2!.id);

    // Closing one tournament's round leaves the other untouched.
    await playRound(t1);
    await closeRoundNow(t1);
    await run();
    expect((await tournamentRow(t1)).current_round_number).toBe(2);
    expect((await tournamentRow(t2)).current_round_number).toBe(1);
    expect((await openMatches(t2)).some((m) => m.id === m2!.id)).toBe(true);
  });

  it('draws a round exactly once when two runs race', async () => {
    const tid = await drawTournament('Race');
    for (let i = 0; i < 8; i++) await enter(tid, await player());
    await Promise.all([run(), run(), run()]);
    const r1 = await pool.query(`SELECT COUNT(*)::int AS n FROM matches WHERE tournament_id = $1`, [tid]);
    expect(r1.rows[0].n).toBe(4);

    await playRound(tid);
    await closeRoundNow(tid);
    await Promise.all([run(), run(), run()]);
    const r2 = await pool.query(
      `SELECT COUNT(*)::int AS n FROM matches WHERE tournament_id = $1 AND round_number = 2`,
      [tid]
    );
    expect(r2.rows[0].n).toBe(2);
  });

  /** Decide a match the way the API does when both innings land mid-round. */
  async function decide(tid: string, m: { id: string; player1_id: string; player2_id: string }) {
    const client = await pool.connect();
    try {
      await client.query(
        `UPDATE matches SET status = 'completed', result = result || $2::jsonb WHERE id = $1`,
        [m.id, JSON.stringify({ winnerId: m.player1_id, player1Score: 20, player2Score: 10, outcome: 'win' })]
      );
      await recordDrawResult(client, tid, 1, m.player1_id, m.player2_id);
    } finally {
      client.release();
    }
  }

  it('closes a round early once every match is decided, when buybacks are off', async () => {
    const tid = await drawTournament('Early', 600, 0);
    for (let i = 0; i < 4; i++) await enter(tid, await player());
    await run();
    for (const m of await openMatches(tid)) await decide(tid, m);
    await run();
    const t = await tournamentRow(tid);
    expect(t.current_round_number).toBe(2);
    expect(await openMatches(tid)).toHaveLength(1);
  });

  it('keeps round 1 open for buybacks even when every match is decided', async () => {
    const tid = await drawTournament('Buyback window', 600, 500);
    for (let i = 0; i < 4; i++) await enter(tid, await player());
    await run();
    for (const m of await openMatches(tid)) await decide(tid, m);
    await run();
    expect((await tournamentRow(tid)).current_round_number).toBe(1);
  });

  it('crowns the champion as soon as a round-1 final is decided, buybacks or not', async () => {
    const tid = await drawTournament('Quick final', 600, 500);
    const [a, b] = [await player(), await player()];
    await enter(tid, a);
    await enter(tid, b);
    await run();
    const [m] = await openMatches(tid);
    await decide(tid, m);
    await run();
    const t = await tournamentRow(tid);
    expect(t.status).toBe('completed');
    expect(t.champion_id).toBe(m.player1_id);
  });

  it('tells each player their opponent when a round starts', async () => {
    const tid = await drawTournament('Round notice');
    const [a, b] = [await player(), await player()];
    await enter(tid, a);
    await enter(tid, b);
    sent.length = 0;
    await run();
    const started = sent.filter((n) => n.type === 'round_started') as Array<{ userId: string; payload: { message: string; opponent: string } }>;
    expect(started.map((n) => n.userId).sort()).toEqual([a, b].sort());
    const names = await pool.query(`SELECT id, username FROM users WHERE id = ANY($1)`, [[a, b]]);
    const nameOf = new Map(names.rows.map((r) => [r.id, r.username]));
    for (const n of started) expect(n.payload.message).toContain(nameOf.get(n.userId === a ? b : a));
  });

  it('reminds registered players once when the start is under an hour away', async () => {
    const tid = await drawTournament('Soon', 60, 500, '30 minutes');
    const p = await player();
    await enter(tid, p);
    sent.length = 0;
    await sendDrawReminders(pool, queue);
    expect(sent.filter((n) => n.type === 'tournament_starting_soon' && n.userId === p)).toHaveLength(1);

    // Once the reminder is in the bell it is not sent again.
    await pool.query(
      `INSERT INTO notifications (user_id, type, channel, payload, idempotency_key, status)
       VALUES ($1, 'tournament_starting_soon', 'in_app', '{}', $2, 'sent')`,
      [p, `tournament-starting:${tid}:${p}:in_app`]
    );
    sent.length = 0;
    await sendDrawReminders(pool, queue);
    expect(sent.filter((n) => n.type === 'tournament_starting_soon' && n.userId === p)).toHaveLength(0);
  });

  it('reminds only the player who has not batted when the round is nearly over', async () => {
    const tid = await drawTournament('Closing', 60);
    const [a, b] = [await player(), await player()];
    await enter(tid, a);
    await enter(tid, b);
    await run();
    const [m] = await openMatches(tid);
    await bat(m.id, a, 15, 5);
    await pool.query(
      `UPDATE tournament_rounds SET ends_at = NOW() + INTERVAL '5 minutes' WHERE tournament_id = $1 AND status = 'active'`,
      [tid]
    );
    sent.length = 0;
    await sendDrawReminders(pool, queue);
    const reminded = sent.filter((n) => n.type === 'round_closing_soon').map((n) => n.userId);
    expect(reminded).toContain(b);
    expect(reminded).not.toContain(a);
  });

  it('never notifies bots', async () => {
    const tid = await drawTournament('Bot mail');
    for (let i = 0; i < 3; i++) await enter(tid, await player());
    sent.length = 0;
    await run();
    const bots = await pool.query(`SELECT id FROM users WHERE is_bot = TRUE`);
    const botIds = new Set(bots.rows.map((r) => r.id));
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.some((n) => botIds.has(n.userId))).toBe(false);
  });
});
