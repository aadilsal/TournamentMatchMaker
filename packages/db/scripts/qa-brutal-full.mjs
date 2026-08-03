/**
 * BRUTAL full-app QA. Builds its own fixtures, then attacks every flow.
 *
 *   node scripts/qa-brutal-full.mjs
 *
 * Requires: API on :3000, postgres + redis up, migrations applied.
 * Does NOT require the dev seed (it builds what it needs).
 */
import pg from 'pg';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env'), override: true });

const API = process.env.API_URL || 'http://localhost:3000/api/v1';
const META_KEY = process.env.META_API_KEY;
const PW = 'password123';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL);
const q = (sql, p) => pool.query(sql, p).then((r) => r.rows);

const results = [];
let section = '';
const S = (n) => { section = n; console.log(`\n\x1b[1m── ${n} ${'─'.repeat(Math.max(0, 56 - n.length))}\x1b[0m`); };

function check(name, ok, detail = '', severity = 'normal') {
  const icon = ok ? '\x1b[32m✓\x1b[0m' : (severity === 'crit' ? '\x1b[41m CRIT \x1b[0m' : '\x1b[31m✗\x1b[0m');
  console.log(`${icon} ${name}${detail ? ` \x1b[90m— ${detail}\x1b[0m` : ''}`);
  results.push({ section, name, status: ok ? 'PASS' : 'FAIL', detail, severity });
  return ok;
}
const crit = (name, ok, detail) => check(name, ok, detail, 'crit');

async function req(method, path, body, opts = {}) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.metaKey) headers['x-meta-api-key'] = opts.metaKey;
  if (opts.cookie) headers.Cookie = opts.cookie;
  Object.assign(headers, opts.headers ?? {});
  const hasBody = body != null && !['GET', 'HEAD'].includes(method);
  let res, json;
  try {
    res = await fetch(`${API}${path}`, { method, headers, body: hasBody ? JSON.stringify(body) : undefined });
    json = await res.json().catch(() => ({}));
  } catch (e) {
    return { status: 0, json: {}, error: { message: String(e) } };
  }
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  return { status: res.status, json, data: json.data, error: json.error, cookie };
}
const meta = (m, p, b) => req(m, p, b, { metaKey: META_KEY });

async function register(email, username, extra = {}) {
  const r = await req('POST', '/auth/register', { email, password: PW, username, ...extra });
  if (!r.json.success) throw new Error(`register ${email}: ${r.status} ${JSON.stringify(r.error)}`);
  return { token: r.data.accessToken, cookie: r.cookie, userId: r.data.user.id, username, email };
}
async function login(email) {
  const r = await req('POST', '/auth/login', { email, password: PW });
  if (!r.json.success) throw new Error(`login ${email}: ${r.status} ${JSON.stringify(r.error)}`);
  return { token: r.data.accessToken, cookie: r.cookie, userId: r.data.user.id };
}

const uniq = () => randomUUID().slice(0, 8);

// ══════════════════════════════════════════════════════ fixtures
const F = {};

async function bootstrap() {
  S('0. Fixtures');
  const tag = uniq();

  F.admin = await register(`admin_${tag}@qa.test`, `admin_${tag}`);
  await q(`UPDATE users SET role = 'superadmin' WHERE id = $1`, [F.admin.userId]);
  F.admin = { ...F.admin, ...(await login(`admin_${tag}@qa.test`)) };

  F.p = [];
  for (let i = 0; i < 6; i++) F.p.push(await register(`p${i}_${tag}@qa.test`, `p${i}_${tag}`, { hasVrHeadset: true, vrDeviceType: 'Quest 3' }));
  check('registered admin + 6 players', F.p.length === 6);

  const [v] = await q(
    `INSERT INTO venues (name, city, country, address, location, capacity)
     VALUES ($1,'Karachi','Pakistan','1 QA Road', ST_SetSRID(ST_MakePoint(67.0011, 24.8607), 4326), 10)
     RETURNING id`,
    [`QA Venue ${tag}`]
  );
  F.venueId = v.id;

  const [slot] = await q(
    `INSERT INTO time_slots (venue_id, start_time, end_time, max_capacity, booked_count)
     VALUES ($1, NOW() + INTERVAL '2 hours', NOW() + INTERVAL '4 hours', 2, 0) RETURNING id`,
    [F.venueId]
  );
  F.slotId = slot.id;

  const [past] = await q(
    `INSERT INTO time_slots (venue_id, start_time, end_time, max_capacity, booked_count)
     VALUES ($1, NOW() - INTERVAL '5 hours', NOW() - INTERVAL '3 hours', 5, 0) RETURNING id`,
    [F.venueId]
  );
  F.pastSlotId = past.id;

  const mk = async (name, status) => {
    const [t] = await q(
      `INSERT INTO tournaments (name, game, start_date, end_date, status, max_players, skill_tier,
                                buyback_price_cents, phase, current_round_number, round_duration_minutes)
       VALUES ($1,'VR Cricket', NOW() + INTERVAL '1 day', NOW() + INTERVAL '5 days', $2, 64, 3, 500, 'normal', 1, 180)
       RETURNING id`, [name, status]);
    await q(
      `INSERT INTO tournament_rounds (tournament_id, round_number, status, starts_at, ends_at)
       VALUES ($1,1,'active', NOW() - INTERVAL '1 hour', NOW() + INTERVAL '6 hours')`, [t.id]);
    return t.id;
  };
  F.tOpen = await mk(`QA Open ${tag}`, 'open');
  F.tOpen2 = await mk(`QA Open2 ${tag}`, 'open');
  F.tClosed = await mk(`QA Closed ${tag}`, 'completed');
  check('fixtures built (venue, slots, 3 tournaments)', !!F.venueId && !!F.tOpen);
}


/** Migration 12: a player needs a tournament_round_slots row to enter the queue. */
async function giveRoundSlot(userId, tournamentId, hours = 2) {
  const [slot] = await q(
    `INSERT INTO time_slots (venue_id, start_time, end_time, max_capacity, booked_count)
     VALUES ($1, NOW() + ($2||' hours')::interval, NOW() + (($2::int+4)||' hours')::interval, 8, 0)
     RETURNING id`, [F.venueId, String(hours)]);
  await q(
    `INSERT INTO tournament_round_slots (tournament_id, user_id, round_number, time_slot_id, venue_id)
     VALUES ($1,$2,1,$3,$4)
     ON CONFLICT (tournament_id, user_id, round_number)
     DO UPDATE SET time_slot_id = EXCLUDED.time_slot_id`,
    [tournamentId, userId, slot.id, F.venueId]);
  return slot.id;
}

// ══════════════════════════════════════════════════════ A. auth
async function testAuth() {
  S('A. Auth & sessions');
  const tag = uniq();

  let r = await req('POST', '/auth/register', { email: 'bad', password: PW, username: `u${tag}` });
  check('invalid email → 400', r.status === 400, `${r.status}`);

  r = await req('POST', '/auth/register', { email: `a${tag}@qa.test`, password: 'short', username: `u${tag}` });
  check('password < 8 chars → 400', r.status === 400, `${r.status}`);

  r = await req('POST', '/auth/register', { email: `a${tag}@qa.test`, password: PW, username: 'x' });
  check('username < 3 chars → 400', r.status === 400, `${r.status}`);

  r = await req('POST', '/auth/register', { email: `a${tag}@qa.test`, password: PW, username: 'has spaces!' });
  check('username with symbols → 400', r.status === 400, `${r.status}`);

  r = await req('POST', '/auth/register', { email: F.p[0].email, password: PW, username: `dup${tag}` });
  check('duplicate email → 409', r.status === 409, `${r.status} ${r.error?.code ?? ''}`);

  r = await req('POST', '/auth/register', { email: `new${tag}@qa.test`, password: PW, username: F.p[0].username });
  check('duplicate username → 409', r.status === 409, `${r.status} ${r.error?.code ?? ''}`);

  r = await req('POST', '/auth/login', { email: F.p[0].email, password: 'wrongpassword' });
  check('wrong password → 401', r.status === 401, `${r.status}`);
  check('wrong password reveals nothing about account existence',
    !/exist|found|registered/i.test(r.error?.message ?? ''), r.error?.message);

  r = await req('POST', '/auth/login', { email: `ghost${tag}@qa.test`, password: PW });
  check('unknown email → 401 (not 404)', r.status === 401, `${r.status}`);

  // token security
  r = await req('GET', '/players/me', null, { token: 'garbage' });
  check('garbage JWT → 401', r.status === 401, `${r.status}`);

  const parts = F.p[0].token.split('.');
  const tampered = `${parts[0]}.${Buffer.from(JSON.stringify({ sub: F.admin.userId, role: 'admin' })).toString('base64url')}.${parts[2]}`;
  r = await req('GET', '/admin/users', null, { token: tampered });
  crit('tampered JWT payload rejected', r.status === 401, `${r.status}`);

  const alg = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const noneTok = `${alg}.${Buffer.from(JSON.stringify({ sub: F.admin.userId, role: 'admin' })).toString('base64url')}.`;
  r = await req('GET', '/admin/users', null, { token: noneTok });
  crit('alg:none JWT rejected', r.status === 401, `${r.status}`);

  r = await req('GET', '/players/me');
  check('no token on protected route → 401', r.status === 401, `${r.status}`);

  // refresh (httpOnly cookie based)
  const fresh = await register(`rf${tag}@qa.test`, `rf${tag}`);
  r = await req('POST', '/auth/refresh', null, { cookie: fresh.cookie });
  const refreshed = check('refresh via cookie returns new access token',
    r.status === 200 && !!r.data?.accessToken, `${r.status} ${r.error?.message ?? ''}`);
  if (refreshed) {
    const rotated = r.cookie || fresh.cookie;
    const reuse = await req('POST', '/auth/refresh', null, { cookie: fresh.cookie });
    check('old refresh token rejected after rotation (replay defence)',
      reuse.status >= 400, `${reuse.status} — reuse ${reuse.status < 400 ? 'ACCEPTED' : 'blocked'}`);
    await req('POST', '/auth/logout', null, { cookie: rotated, token: fresh.token });
    const afterLogout = await req('POST', '/auth/refresh', null, { cookie: rotated });
    check('refresh token dead after logout', afterLogout.status >= 400, `${afterLogout.status}`);
  }

  r = await req('POST', '/auth/refresh', null, { cookie: 'refresh_token=not-a-token' });
  check('bogus refresh cookie → 4xx', r.status >= 400 && r.status < 500, `${r.status}`);

}

// ══════════════════════════════════════════════════════ B. authz / IDOR
async function testAuthz() {
  S('B. Authorization & IDOR');
  const [a, b] = F.p;

  const adminRoutes = [
    ['GET', '/admin/users'], ['GET', '/admin/dashboard'], ['GET', '/admin/audit-logs'],
    ['GET', '/admin/tournaments'], ['GET', '/admin/venues'], ['GET', '/admin/queue'],
    ['GET', '/admin/system/health'], ['GET', '/admin/integrations'],
  ];
  for (const [m, p] of adminRoutes) {
    const r = await req(m, p, null, { token: a.token });
    crit(`player blocked from ${p}`, r.status === 403 || r.status === 401, `${r.status}`);
  }
  const w = await req('PATCH', `/admin/users/${b.userId}`, { role: 'admin' }, { token: a.token });
  crit('player cannot self-promote via admin PATCH', w.status === 403 || w.status === 401, `${w.status}`);

  const del = await req('DELETE', `/admin/users/${b.userId}`, null, { token: a.token });
  crit('player cannot delete users', del.status === 403 || del.status === 401, `${del.status}`);

  // IDOR: booking belonging to another user
  const bk = await req('POST', '/bookings', { timeSlotId: F.slotId }, { token: b.token });
  if (bk.status === 201 || bk.status === 200) {
    F.bookingB = bk.data.id;
    const steal = await req('DELETE', `/bookings/${F.bookingB}`, null, { token: a.token });
    crit('cannot cancel another user\'s booking', steal.status === 403 || steal.status === 404, `${steal.status}`);
  } else {
    check('setup booking for IDOR test', false, `${bk.status} ${bk.error?.message}`);
  }

  const mine = await req('GET', '/bookings/me', null, { token: a.token });
  check('/bookings/me only returns own bookings',
    (mine.data ?? []).every((x) => x.userId === a.userId || x.userId === undefined),
    `${(mine.data ?? []).length} rows`);

  // notifications of another user
  const notif = await req('PATCH', `/notifications/${randomUUID()}/read`, null, { token: a.token });
  check('marking unknown notification read → 4xx', notif.status >= 400 && notif.status < 500, `${notif.status}`);
}

// ══════════════════════════════════════════════════════ C. injection / payloads
async function testInjection() {
  S('C. Injection, XSS & hostile payloads');
  const a = F.p[0];

  const sqli = ["' OR '1'='1", "'; DROP TABLE users; --", "1' UNION SELECT NULL--", "\\'; DELETE FROM matches; --"];
  for (const p of sqli) {
    const r = await req('POST', '/auth/login', { email: `${p}@x.com`, password: p });
    check(`SQLi login payload rejected: ${p.slice(0, 18)}`, r.status >= 400 && r.status < 500, `${r.status}`);
  }
  const stillThere = await q(`SELECT count(*)::int AS c FROM users`);
  crit('users table intact after SQLi attempts', stillThere[0].c > 0, `${stillThere[0].c} users`);

  for (const p of sqli) {
    const r = await req('GET', `/players/${encodeURIComponent(p)}`, null, { token: a.token });
    check(`SQLi in username path safe: ${p.slice(0, 16)}`, r.status >= 400 && r.status < 500, `${r.status}`);
  }

  const xss = '<script>alert(1)</script>';
  let r = await req('PATCH', '/players/me', { city: xss }, { token: a.token });
  if (r.status === 200) {
    const stored = r.data?.city ?? '';
    check('XSS payload stored raw (client must escape)', true, `stored as: ${String(stored).slice(0, 40)}`);
  } else {
    check('XSS payload rejected at input', r.status === 400, `${r.status}`);
  }

  r = await req('PATCH', '/players/me', { city: 'x'.repeat(50_000) }, { token: a.token });
  check('50KB field → 400 not 500', r.status === 400, `${r.status}`);

  r = await req('POST', '/auth/login', { email: 'a@b.com', password: 'x'.repeat(200_000) });
  check('200KB password → 4xx not 500', r.status >= 400 && r.status < 500, `${r.status}`);

  r = await req('POST', '/bookings', { timeSlotId: F.slotId, extraJunk: { a: 1 }, __proto__: { admin: true } }, { token: a.token });
  check('prototype-pollution keys do not 500', r.status !== 500, `${r.status}`);

  const raw = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"email": "a@b.com", ',
  });
  check('malformed JSON → 400 not 500', raw.status === 400, `${raw.status}`);

  r = await req('GET', '/players/me', null, { token: a.token, headers: { 'Content-Type': 'text/plain' } });
  check('wrong content-type on GET tolerated', r.status === 200, `${r.status}`);

  r = await req('GET', '/tournaments?limit=999999999', null, {});
  check('absurd limit does not 500', r.status !== 500, `${r.status}`);

  r = await req('GET', '/tournaments?limit=-5', null, {});
  check('negative limit does not 500', r.status !== 500, `${r.status}`);

  r = await req('GET', `/venues/${'a'.repeat(500)}`, null, {});
  check('overlong path param → 4xx not 500', r.status >= 400 && r.status < 500, `${r.status}`);

  r = await req('PATCH', '/players/me', { username: '𝕏𝕏𝕏 🏏🎮' }, { token: a.token });
  check('unicode/emoji does not 500', r.status !== 500, `${r.status}`);
}

// ══════════════════════════════════════════════════════ D. tournaments
async function testTournaments() {
  S('D. Tournament lifecycle');
  const [a, b] = F.p;

  let r = await req('POST', `/tournaments/${F.tOpen}/register`, {}, { token: a.token });
  check('register in open tournament → 2xx', r.status < 300, `${r.status} ${r.error?.message ?? ''}`);

  r = await req('POST', `/tournaments/${F.tOpen}/register`, {}, { token: a.token });
  check('double-register is idempotent or 409', r.status < 300 || r.status === 409, `${r.status}`);

  // THE migration-12 constraint
  r = await req('POST', `/tournaments/${F.tOpen2}/register`, {}, { token: a.token });
  crit('second live tournament → clean 409 (not 500)', r.status === 409,
    `${r.status} ${r.error?.code ?? ''} ${r.error?.message ?? ''}`);

  r = await req('POST', `/tournaments/${F.tClosed}/register`, {}, { token: b.token });
  check('register in completed tournament → 409', r.status === 409, `${r.status}`);

  r = await req('POST', `/tournaments/${randomUUID()}/register`, {}, { token: b.token });
  check('register in unknown tournament → 404', r.status === 404, `${r.status}`);

  r = await req('POST', `/tournaments/not-a-uuid/register`, {}, { token: b.token });
  check('register with malformed id → 4xx not 500', r.status >= 400 && r.status < 500, `${r.status}`);

  r = await req('POST', `/tournaments/${F.tOpen}/register`, {}, {});
  check('register without auth → 401', r.status === 401, `${r.status}`);

  r = await req('POST', `/tournaments/${F.tOpen}/register`, { bookingId: randomUUID() }, { token: b.token });
  check('register with someone else\'s/unknown bookingId → 400', r.status === 400, `${r.status}`);

  // read paths
  for (const p of ['', '/rounds', '/participants', '/matches', '/bracket']) {
    const rr = await req('GET', `/tournaments/${F.tOpen}${p}`, null, { token: a.token });
    check(`GET /tournaments/:id${p || ''} → 200`, rr.status === 200, `${rr.status}`);
  }
  r = await req('GET', `/tournaments/${randomUUID()}`, null, {});
  check('unknown tournament → 404', r.status === 404, `${r.status}`);

  // withdraw
  r = await req('DELETE', `/tournaments/${F.tOpen}/register`, null, { token: a.token });
  check('withdraw from tournament → 2xx', r.status < 300, `${r.status} ${r.error?.message ?? ''}`);

  r = await req('POST', `/tournaments/${F.tOpen2}/register`, {}, { token: a.token });
  check('can join another tournament after withdrawing', r.status < 300,
    `${r.status} ${r.error?.message ?? ''}`);
  await req('DELETE', `/tournaments/${F.tOpen2}/register`, null, { token: a.token });
}

// ══════════════════════════════════════════════════════ E. bookings & capacity
async function testBookings() {
  S('E. Bookings, capacity & races');
  const [a, b, c, d] = F.p;

  let r = await req('POST', '/bookings', { timeSlotId: F.pastSlotId }, { token: a.token });
  check('booking a past slot → 4xx', r.status >= 400 && r.status < 500, `${r.status} ${r.error?.message ?? ''}`);

  r = await req('POST', '/bookings', { timeSlotId: randomUUID() }, { token: a.token });
  check('booking unknown slot → 404', r.status === 404, `${r.status}`);

  r = await req('POST', '/bookings', { timeSlotId: 'nope' }, { token: a.token });
  check('booking malformed slot id → 400', r.status === 400, `${r.status}`);

  r = await req('POST', '/bookings', { timeSlotId: F.slotId }, {});
  check('booking without auth → 401', r.status === 401, `${r.status}`);

  // capacity: slot has capacity 2, player b already booked in section B
  const [cap] = await q(
    `INSERT INTO time_slots (venue_id, start_time, end_time, max_capacity, booked_count)
     VALUES ($1, NOW() + INTERVAL '3 hours', NOW() + INTERVAL '5 hours', 1, 0) RETURNING id`, [F.venueId]);

  const race = await Promise.all([
    req('POST', '/bookings', { timeSlotId: cap.id }, { token: c.token }),
    req('POST', '/bookings', { timeSlotId: cap.id }, { token: d.token }),
    req('POST', '/bookings', { timeSlotId: cap.id }, { token: F.p[4].token }),
  ]);
  const won = race.filter((x) => x.status < 300).length;
  crit('capacity-1 slot: exactly one concurrent booking wins', won === 1,
    `${won} succeeded (${race.map((x) => x.status).join('/')})`);

  const [after] = await q(`SELECT booked_count, max_capacity AS capacity FROM time_slots WHERE id = $1`, [cap.id]);
  crit('booked_count never exceeds capacity', after.booked_count <= after.capacity,
    `booked=${after.booked_count} cap=${after.capacity}`);

  // duplicate booking by same user
  const [cap2] = await q(
    `INSERT INTO time_slots (venue_id, start_time, end_time, max_capacity, booked_count)
     VALUES ($1, NOW() + INTERVAL '6 hours', NOW() + INTERVAL '8 hours', 5, 0) RETURNING id`, [F.venueId]);
  const first = await req('POST', '/bookings', { timeSlotId: cap2.id }, { token: c.token });
  const second = await req('POST', '/bookings', { timeSlotId: cap2.id }, { token: c.token });
  check('same user double-booking same slot → 409/idempotent',
    second.status === 409 || second.data?.id === first.data?.id,
    `${second.status} first=${first.data?.id} second=${second.data?.id}`);

  const [cnt] = await q(`SELECT count(*)::int c FROM bookings WHERE time_slot_id = $1 AND user_id = $2 AND status='confirmed'`,
    [cap2.id, c.userId]);
  crit('no duplicate confirmed bookings for one user+slot', cnt.c <= 1, `${cnt.c} rows`);

  // cancel + capacity release
  if (first.status < 300) {
    const before = (await q(`SELECT booked_count FROM time_slots WHERE id=$1`, [cap2.id]))[0].booked_count;
    const canc = await req('DELETE', `/bookings/${first.data.id}`, null, { token: c.token });
    check('cancel own booking → 2xx', canc.status < 300, `${canc.status}`);
    const post = (await q(`SELECT booked_count FROM time_slots WHERE id=$1`, [cap2.id]))[0].booked_count;
    check('cancelling releases capacity', post < before, `${before} → ${post}`);
    const again = await req('DELETE', `/bookings/${first.data.id}`, null, { token: c.token });
    check('double-cancel → 4xx not 500', again.status >= 400 && again.status < 500, `${again.status}`);
    const postpost = (await q(`SELECT booked_count FROM time_slots WHERE id=$1`, [cap2.id]))[0].booked_count;
    crit('double-cancel does not double-decrement capacity', postpost === post, `${post} → ${postpost}`);
    crit('booked_count never goes negative', postpost >= 0, `${postpost}`);
  }
}

// ══════════════════════════════════════════════════════ F. matchmaking
async function testMatchmaking() {
  S('F. Matchmaking queue');
  const a = F.p[5];
  await giveRoundSlot(a.userId, F.tOpen);

  let r = await req('POST', '/matchmaking/queue', { tournamentId: F.tOpen }, { token: a.token });
  const joined = r.status < 300;
  check('join queue (registered player required)', joined || r.status === 403 || r.status === 409,
    `${r.status} ${r.error?.message ?? ''}`);

  if (!joined) {
    await req('POST', `/tournaments/${F.tOpen}/register`, {}, { token: a.token });
    r = await req('POST', '/matchmaking/queue', { tournamentId: F.tOpen }, { token: a.token });
    check('join queue after registering → 2xx', r.status < 300, `${r.status} ${r.error?.message ?? ''}`);
  }

  r = await req('POST', '/matchmaking/queue', { tournamentId: F.tOpen }, { token: a.token });
  check('double-join queue → 2xx idempotent or 409', r.status < 300 || r.status === 409, `${r.status}`);

  const size = await redis.zcard(`queue:tournament:${F.tOpen}`);
  crit('player not duplicated in queue after double-join', size <= 1, `queue size=${size}`);

  r = await req('GET', '/matchmaking/status', null, { token: a.token });
  check('queue status → 200', r.status === 200, `${r.status}`);

  r = await req('POST', '/matchmaking/queue', { tournamentId: randomUUID() }, { token: a.token });
  check('queue for unknown tournament → 4xx', r.status >= 400 && r.status < 500, `${r.status}`);

  r = await req('POST', '/matchmaking/queue', { tournamentId: 'x' }, { token: a.token });
  check('queue with malformed id → 400', r.status === 400, `${r.status}`);

  r = await req('DELETE', '/matchmaking/queue', null, { token: a.token });
  check('leave queue → 2xx', r.status < 300, `${r.status}`);

  r = await req('DELETE', '/matchmaking/queue', null, { token: a.token });
  check('leave queue twice → not 500', r.status !== 500, `${r.status}`);

  r = await req('POST', '/matchmaking/queue', { tournamentId: F.tOpen }, {});
  check('queue without auth → 401', r.status === 401, `${r.status}`);
}

// ══════════════════════════════════════════════════════ G. matches + VR
async function makeMatch(tournamentId, p1, p2, { result = null, hours = 1 } = {}) {
  const [slot] = await q(
    `INSERT INTO time_slots (venue_id, start_time, end_time, max_capacity, booked_count)
     VALUES ($1, NOW() + ($2||' hours')::interval, NOW() + (($2::int+1)||' hours')::interval, 4, 0)
     RETURNING id, start_time, end_time`, [F.venueId, String(hours)]);
  const [m] = await q(
    `INSERT INTO matches (tournament_id, player1_id, player2_id, venue_id, time_slot_id, status, result, scheduled_at, round_number)
     VALUES ($1,$2,$3,$4,$5,'confirmed',$6,$7,1) RETURNING id`,
    [tournamentId, p1, p2, F.venueId, slot.id, result ? JSON.stringify(result) : null, slot.start_time]);
  return { matchId: m.id, slot };
}
const clearMatches = (uid) => q(
  `UPDATE matches SET status='completed' WHERE (player1_id=$1 OR player2_id=$1)
    AND status IN ('pending_confirmation','confirmed','in_progress')`, [uid]);

async function testMatchesAndVR() {
  S('G. Matches + Meta/VR API');
  const [a, b, c] = F.p;
  await clearMatches(a.userId); await clearMatches(b.userId); await clearMatches(c.userId);

  const { matchId, slot } = await makeMatch(F.tOpen, a.userId, b.userId, {
    result: { player1Score: null, player2Score: null, winnerId: null, chaseTarget: 87, chasePlayerId: b.userId },
  });

  // --- auth
  let r = await req('GET', `/integrations/meta/matches/current?userId=${a.userId}`);
  check('meta without API key → 401', r.status === 401, `${r.status}`);
  r = await req('GET', `/integrations/meta/matches/current?userId=${a.userId}`, null, { metaKey: 'wrong' });
  check('meta with wrong API key → 401', r.status === 401, `${r.status}`);

  // --- shape
  r = await meta('GET', `/integrations/meta/matches/current?userId=${a.userId}`);
  const d = r.data, m = d?.match;
  check('current-match → 200', r.status === 200, `${r.status}`);
  const TOP = ['canSubmitSoloTarget', 'inQueue', 'match', 'tournamentId'];
  check('top-level keys exactly as documented',
    JSON.stringify(Object.keys(d ?? {}).sort()) === JSON.stringify(TOP), Object.keys(d ?? {}).join(','));
  const MK = ['amChasing', 'amSettingTarget', 'chaseTarget', 'endTime', 'id', 'myScore', 'opponent', 'opponentScore', 'startTime', 'venue'];
  check('match keys exactly as documented',
    JSON.stringify(Object.keys(m ?? {}).sort()) === JSON.stringify(MK), Object.keys(m ?? {}).join(','));
  for (const f of ['queueSize', 'soloTarget', 'status', 'scheduledAt', 'slot', 'skillTier'])
    check(`legacy field '${f}' gone`, !JSON.stringify(d).includes(`"${f}"`), '');

  check('tournamentId present on active match', d?.tournamentId === F.tOpen, `${d?.tournamentId}`);
  check('opponent is plain username string', m?.opponent === b.username, `${m?.opponent}`);
  check('venue is plain name string', typeof m?.venue === 'string', `${m?.venue}`);
  check('startTime === booked slot start', Date.parse(m?.startTime) === new Date(slot.start_time).getTime(),
    `${m?.startTime} vs ${new Date(slot.start_time).toISOString()}`);
  check('endTime === booked slot end', Date.parse(m?.endTime) === new Date(slot.end_time).getTime(),
    `${m?.endTime} vs ${new Date(slot.end_time).toISOString()}`);
  check('chaseTarget surfaced', m?.chaseTarget === 87, `${m?.chaseTarget}`);
  check('amChasing false for setter', m?.amChasing === false, `${m?.amChasing}`);
  check('amSettingTarget false when a chase target exists', m?.amSettingTarget === false, `${m?.amSettingTarget}`);
  const rb = await meta('GET', `/integrations/meta/matches/current?userId=${b.userId}`);
  check('chaser sees amChasing=true', rb.data?.match?.amChasing === true, `${rb.data?.match?.amChasing}`);

  r = await meta('GET', '/integrations/meta/matches/current?userId=not-a-uuid');
  check('meta malformed userId → 400', r.status === 400, `${r.status}`);
  r = await meta('GET', `/integrations/meta/matches/current?userId=${randomUUID()}`);
  check('meta unknown user → 200 idle', r.status === 200 && r.data?.match === null, `${r.status}`);

  // --- score validation
  r = await meta('POST', `/integrations/meta/matches/${randomUUID()}/scores`, { userId: a.userId, score: 10 });
  check('score on unknown match → 404', r.status === 404, `${r.status}`);
  r = await meta('POST', `/integrations/meta/matches/${matchId}/scores`, { userId: c.userId, score: 10 });
  check('score by non-participant → 403', r.status === 403, `${r.status}`);
  for (const [lbl, body] of [
    ['negative score → 400', { userId: a.userId, score: -1 }],
    ['score > 999 → 400', { userId: a.userId, score: 1000 }],
    ['fractional score → 400', { userId: a.userId, score: 1.5 }],
    ['string score → 400', { userId: a.userId, score: '5' }],
    ['missing score → 400', { userId: a.userId }],
  ]) {
    const rr = await meta('POST', `/integrations/meta/matches/${matchId}/scores`, body);
    check(lbl, rr.status === 400, `${rr.status}`);
  }

  // --- happy path + duplicates
  r = await meta('POST', `/integrations/meta/matches/${matchId}/scores`, { userId: a.userId, score: 50 });
  check('first score accepted', r.status === 200, `${r.status} ${r.error?.message ?? ''}`);
  r = await meta('POST', `/integrations/meta/matches/${matchId}/scores`, { userId: a.userId, score: 60 });
  check('duplicate score → 409', r.status === 409, `${r.status}`);

  const race = await Promise.all([
    meta('POST', `/integrations/meta/matches/${matchId}/scores`, { userId: b.userId, score: 51 }),
    meta('POST', `/integrations/meta/matches/${matchId}/scores`, { userId: b.userId, score: 52 }),
  ]);
  crit('concurrent duplicate score: exactly one wins', race.filter((x) => x.status === 200).length === 1,
    race.map((x) => x.status).join('/'));

  // --- chase resolution
  await clearMatches(a.userId); await clearMatches(b.userId);
  let mm = await makeMatch(F.tOpen, a.userId, b.userId, {
    result: { player1Score: null, player2Score: null, winnerId: null, chaseTarget: 50, chasePlayerId: b.userId } });
  await meta('POST', `/integrations/meta/matches/${mm.matchId}/scores`, { userId: a.userId, score: 50 });
  r = await meta('POST', `/integrations/meta/matches/${mm.matchId}/scores`, { userId: b.userId, score: 51 });
  check('chaser > target → chaser wins', r.data?.result?.winnerId === b.userId, `${r.data?.result?.winnerId}`);

  await clearMatches(a.userId); await clearMatches(b.userId);
  mm = await makeMatch(F.tOpen, a.userId, b.userId, {
    result: { player1Score: null, player2Score: null, winnerId: null, chaseTarget: 50, chasePlayerId: b.userId } });
  await meta('POST', `/integrations/meta/matches/${mm.matchId}/scores`, { userId: a.userId, score: 50 });
  r = await meta('POST', `/integrations/meta/matches/${mm.matchId}/scores`, { userId: b.userId, score: 49 });
  check('chaser < target → setter wins', r.data?.result?.winnerId === a.userId, `${r.data?.result?.winnerId}`);

  await clearMatches(a.userId); await clearMatches(b.userId);
  mm = await makeMatch(F.tOpen, a.userId, b.userId, {
    result: { player1Score: null, player2Score: null, winnerId: null, chaseTarget: 50, chasePlayerId: b.userId } });
  await meta('POST', `/integrations/meta/matches/${mm.matchId}/scores`, { userId: a.userId, score: 50 });
  r = await meta('POST', `/integrations/meta/matches/${mm.matchId}/scores`, { userId: b.userId, score: 50 });
  check('chase tie → cancelled + rematch',
    r.data?.status === 'cancelled' && r.data?.result?.outcome === 'rematch',
    `${r.data?.status}/${r.data?.result?.outcome}`);
  const post = await meta('GET', `/integrations/meta/matches/current?userId=${a.userId}`);
  check('after rematch match === null', post.data?.match === null, JSON.stringify(post.data?.match));

  // --- expired slot
  await clearMatches(a.userId); await clearMatches(b.userId);
  mm = await makeMatch(F.tOpen, a.userId, b.userId, { hours: -5 });
  r = await meta('POST', `/integrations/meta/matches/${mm.matchId}/scores`, { userId: a.userId, score: 20 });
  check('score after slot ended → 409', r.status === 409, `${r.status} ${r.error?.message ?? ''}`);

  // --- amSettingTarget in standard mode
  await clearMatches(a.userId); await clearMatches(b.userId);
  mm = await makeMatch(F.tOpen, a.userId, b.userId);
  r = await meta('GET', `/integrations/meta/matches/current?userId=${a.userId}`);
  check('standard mode, no scores → amSettingTarget true', r.data?.match?.amSettingTarget === true,
    `${r.data?.match?.amSettingTarget}`);
  await meta('POST', `/integrations/meta/matches/${mm.matchId}/scores`, { userId: a.userId, score: 40 });
  r = await meta('GET', `/integrations/meta/matches/current?userId=${b.userId}`);
  check('second batter → amSettingTarget false', r.data?.match?.amSettingTarget === false,
    `${r.data?.match?.amSettingTarget}`);

  // --- web score entry must be disabled
  r = await req('POST', `/matches/${mm.matchId}/score`, { score: 10 }, { token: a.token });
  check('web score submit disabled/blocked', r.status >= 400 && r.status < 500,
    `${r.status} ${r.error?.message ?? ''}`);

  // --- IDOR on match read
  r = await req('GET', `/matches/${mm.matchId}`, null, { token: c.token });
  crit('non-participant cannot read match detail', r.status === 403 || r.status === 404, `${r.status}`);

  await clearMatches(a.userId); await clearMatches(b.userId);
}

// ══════════════════════════════════════════════════════ H. solo target
async function testSolo() {
  S('H. Solo target');
  const a = F.p[5];
  await clearMatches(a.userId);
  await req('DELETE', '/matchmaking/queue', null, { token: a.token });

  let r = await meta('POST', '/integrations/meta/solo-target', { userId: a.userId, tournamentId: F.tOpen, target: 50 });
  check('solo-target while not queued → 409', r.status === 409, `${r.status} ${r.error?.message ?? ''}`);

  await req('POST', `/tournaments/${F.tOpen}/register`, {}, { token: a.token });
  await giveRoundSlot(a.userId, F.tOpen);
  const j = await req('POST', '/matchmaking/queue', { tournamentId: F.tOpen }, { token: a.token });
  if (!check('queued for solo test', j.status < 300, `${j.status} ${j.error?.message ?? ''}`)) return;

  r = await meta('GET', `/integrations/meta/matches/current?userId=${a.userId}`);
  check('queued → inQueue true', r.data?.inQueue === true, JSON.stringify(r.data));
  check('queued → tournamentId returned for solo-target', r.data?.tournamentId === F.tOpen, `${r.data?.tournamentId}`);
  check('queued → canSubmitSoloTarget true', r.data?.canSubmitSoloTarget === true, `${r.data?.canSubmitSoloTarget}`);

  for (const [lbl, body] of [
    ['target 1000 → 400', { userId: a.userId, tournamentId: F.tOpen, target: 1000 }],
    ['target -1 → 400', { userId: a.userId, tournamentId: F.tOpen, target: -1 }],
    ['target 1.5 → 400', { userId: a.userId, tournamentId: F.tOpen, target: 1.5 }],
    ['missing tournamentId → 400', { userId: a.userId, target: 5 }],
  ]) {
    const rr = await meta('POST', '/integrations/meta/solo-target', body);
    check(lbl, rr.status === 400, `${rr.status}`);
  }

  r = await meta('POST', '/integrations/meta/solo-target', { userId: a.userId, tournamentId: randomUUID(), target: 5 });
  check('unknown tournament → 403', r.status === 403, `${r.status}`);

  r = await meta('POST', '/integrations/meta/solo-target', { userId: a.userId, tournamentId: F.tOpen, target: 0 });
  check('target 0 accepted → 201', r.status === 201, `${r.status} ${r.error?.message ?? ''}`);

  r = await meta('GET', `/integrations/meta/matches/current?userId=${a.userId}`);
  check('canSubmitSoloTarget false after submit', r.data?.canSubmitSoloTarget === false, `${r.data?.canSubmitSoloTarget}`);

  const dup = await meta('POST', '/integrations/meta/solo-target', { userId: a.userId, tournamentId: F.tOpen, target: 999 });
  crit('duplicate solo-target rejected (not silently overwritten)', dup.status === 409,
    `${dup.status} — ${dup.status === 201 ? 'OVERWROTE target' : dup.error?.message ?? ''}`);
  const [row] = await q(`SELECT solo_target FROM tournament_participants WHERE user_id=$1 AND tournament_id=$2`,
    [a.userId, F.tOpen]);
  crit('stored solo target not clobbered', row?.solo_target === 0, `db=${row?.solo_target}`);

  await req('DELETE', '/matchmaking/queue', null, { token: a.token });
}

// ══════════════════════════════════════════════════════ I. link code
async function testLinkCode() {
  S('I. Identity link code');
  const a = F.p[0];

  let r = await meta('POST', '/integrations/meta/identity/verify-link-code', { code: '123' });
  check('3-digit code → 400', r.status === 400, `${r.status}`);
  r = await meta('POST', '/integrations/meta/identity/verify-link-code', { code: 'abcd' });
  check('non-numeric code → 400', r.status === 400, `${r.status}`);
  await redis.del('meta:link-code:0000');
  r = await meta('POST', '/integrations/meta/identity/verify-link-code', { code: '0000' });
  check('unknown code → 400 CODE_INVALID', r.status === 400 && r.error?.code === 'CODE_INVALID', `${r.error?.code}`);

  r = await req('GET', '/integrations/meta/link-code');
  check('link-code without login → 401', r.status === 401, `${r.status}`);

  const gen = await req('GET', '/integrations/meta/link-code', null, { token: a.token });
  if (!check('generate link code → 200', gen.status === 200, `${gen.status}`)) return;
  const code = gen.data.code;
  check('code is 4 digits', /^\d{4}$/.test(code), code);
  const ttl = await redis.ttl(`meta:link-code:${code}`);
  check('code expires within 10 min', ttl > 0 && ttl <= 600, `ttl=${ttl}`);

  const v = await meta('POST', '/integrations/meta/identity/verify-link-code', { code });
  check('verify returns correct userId', v.status === 200 && v.data?.userId === a.userId, `${v.status}`);
  check('verify returns only userId+username',
    JSON.stringify(Object.keys(v.data ?? {}).sort()) === '["userId","username"]', Object.keys(v.data ?? {}).join(','));

  const replay = await meta('POST', '/integrations/meta/identity/verify-link-code', { code });
  crit('link code is single-use', replay.status === 400 && replay.error?.code === 'CODE_INVALID',
    `${replay.status} ${replay.error?.code}`);

  // brute force: 4-digit space is small — is there any throttle?
  let hits = 0;
  for (let i = 0; i < 40; i++) {
    const rr = await meta('POST', '/integrations/meta/identity/verify-link-code',
      { code: String(1000 + i).padStart(4, '0') });
    if (rr.status === 429) { hits = -1; break; }
    hits++;
  }
  check('link-code brute force is rate limited', hits === -1,
    hits === -1 ? 'throttled' : `${hits} guesses allowed with no 429 — 10k space is brute-forceable`);
}

// ══════════════════════════════════════════════════════ J. admin
async function testAdmin() {
  S('J. Admin surface');
  const t = F.admin.token;

  for (const p of ['/admin/dashboard', '/admin/users', '/admin/tournaments', '/admin/venues',
    '/admin/matches', '/admin/bookings', '/admin/slots', '/admin/queue', '/admin/audit-logs',
    '/admin/buybacks', '/admin/notifications', '/admin/system/health', '/admin/integrations']) {
    const r = await req('GET', p, null, { token: t });
    check(`GET ${p} → 200`, r.status === 200, `${r.status} ${r.error?.message ?? ''}`);
  }

  for (const p of ['/admin/users', '/admin/tournaments', '/admin/venues', '/admin/matches']) {
    const r = await req('GET', `${p}/${randomUUID()}`, null, { token: t });
    check(`${p}/:unknownId → 404`, r.status === 404, `${r.status}`);
    const r2 = await req('GET', `${p}/not-a-uuid`, null, { token: t });
    check(`${p}/:malformedId → 4xx not 500`, r2.status >= 400 && r2.status < 500, `${r2.status}`);
  }

  // create/update/delete venue
  let r = await req('POST', '/admin/venues', {
    name: `QA Admin Venue ${uniq()}`, city: 'Karachi', country: 'Pakistan',
    address: '1 Admin Rd', latitude: 24.86, longitude: 67.0, capacity: 5,
  }, { token: t });
  const vOk = check('admin create venue → 2xx', r.status < 300, `${r.status} ${JSON.stringify(r.error ?? '')}`);
  if (vOk) {
    const vid = r.data.id;
    const up = await req('PATCH', `/admin/venues/${vid}`, { capacity: 9 }, { token: t });
    check('admin update venue → 2xx', up.status < 300, `${up.status}`);
    const bad = await req('PATCH', `/admin/venues/${vid}`, { capacity: -5 }, { token: t });
    check('negative capacity rejected', bad.status === 400, `${bad.status}`);
    const dl = await req('DELETE', `/admin/venues/${vid}`, null, { token: t });
    check('admin delete venue → 2xx', dl.status < 300, `${dl.status}`);
    const dl2 = await req('DELETE', `/admin/venues/${vid}`, null, { token: t });
    check('double-delete venue → 404 not 500', dl2.status === 404, `${dl2.status}`);
  }

  // admin cannot delete themselves into lockout
  r = await req('DELETE', `/admin/users/${F.admin.userId}`, null, { token: t });
  check('admin self-delete blocked or handled', r.status !== 500, `${r.status} ${r.error?.message ?? ''}`);

  // audit trail written
  const [audit] = await q(`SELECT count(*)::int c FROM audit_logs WHERE actor_id = $1`, [F.admin.userId]);
  check('admin actions written to audit_logs', audit.c > 0, `${audit.c} entries`);

  // role escalation via admin PATCH of own role is fine, but check validation
  r = await req('PATCH', `/admin/users/${F.p[1].userId}`, { role: 'super_wizard' }, { token: t });
  check('invalid role value rejected', r.status === 400, `${r.status}`);
}

// ══════════════════════════════════════════════════════ K. rate limits & envelope
async function testOps() {
  S('K. Rate limiting, envelope & resilience');

  const r = await req('GET', '/tournaments');
  const keys = Object.keys(r.json).sort();
  check('success envelope = {data,error,meta,success}',
    JSON.stringify(keys) === JSON.stringify(['data', 'error', 'meta', 'success']), keys.join(','));
  const bad = await req('GET', '/tournaments/not-a-uuid');
  check('error envelope has code+message', bad.json.success === false && !!bad.error?.code, JSON.stringify(bad.error));
  check('error envelope has data:null', bad.json.data === null, `${bad.json.data}`);

  const health = await fetch(`${API.replace('/api/v1', '')}/health`);
  check('health endpoint → 200', health.status === 200, `${health.status}`);

  // rate limit on auth (brute force defence)
  let limited = false;
  for (let i = 0; i < 60; i++) {
    const rr = await req('POST', '/auth/login', { email: F.p[0].email, password: `bad${i}` });
    if (rr.status === 429) { limited = true; break; }
  }
  crit('login brute force is rate limited', limited, limited ? 'got 429' : '60 wrong-password attempts with no 429');

  // meta API poll cadence
  const t0 = Date.now();
  await Promise.all(Array.from({ length: 10 }, () =>
    meta('GET', `/integrations/meta/matches/current?userId=${F.p[0].userId}`)));
  const ms = Date.now() - t0;
  check('10 concurrent VR polls < 3s', ms < 3000, `${ms}ms`);

  // unknown route
  const nf = await req('GET', '/definitely/not/a/route');
  check('unknown route → 404 with envelope', nf.status === 404, `${nf.status}`);

  // CORS
  const cors = await fetch(`${API}/tournaments`, { headers: { Origin: 'https://evil.example' } });
  const allow = cors.headers.get('access-control-allow-origin');
  check('CORS does not echo arbitrary origin', allow !== 'https://evil.example', `allow-origin: ${allow}`);

  // security headers
  const h = await fetch(`${API}/tournaments`);
  check('X-Content-Type-Options set', h.headers.get('x-content-type-options') === 'nosniff',
    `${h.headers.get('x-content-type-options')}`);
  check('no X-Powered-By leak', !h.headers.get('x-powered-by'), `${h.headers.get('x-powered-by')}`);
}

// ══════════════════════════════════════════════════════ runner
(async () => {
  console.log(`\n\x1b[1mBRUTAL FULL-APP QA\x1b[0m — ${API}\n`);
  try {
    await bootstrap();
    await testAuth();
    await testAuthz();
    await testInjection();
    await testTournaments();
    await testBookings();
    await testMatchmaking();
    await testMatchesAndVR();
    await testSolo();
    await testLinkCode();
    await testAdmin();
    await testOps();
  } catch (e) {
    console.error(`\n\x1b[31mSUITE ABORTED:\x1b[0m ${e.stack ?? e.message}`);
    results.push({ section, name: 'suite completed', status: 'FAIL', detail: e.message, severity: 'crit' });
  }

  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL');
  const crits = fail.filter((r) => r.severity === 'crit');

  console.log(`\n${'═'.repeat(66)}`);
  console.log(`PASS ${pass}   FAIL ${fail.length}   (${crits.length} critical)`);
  if (crits.length) {
    console.log(`\n\x1b[41m CRITICAL \x1b[0m`);
    for (const f of crits) console.log(`  ✗ [${f.section}] ${f.name} — ${f.detail}`);
  }
  const rest = fail.filter((r) => r.severity !== 'crit');
  if (rest.length) {
    console.log(`\n\x1b[31mFAILURES\x1b[0m`);
    for (const f of rest) console.log(`  ✗ [${f.section}] ${f.name} — ${f.detail}`);
  }
  await pool.end().catch(() => {});
  redis.disconnect();
  process.exit(fail.length ? 1 : 0);
})();
