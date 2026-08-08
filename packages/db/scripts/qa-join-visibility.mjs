/**
 * Checks the three answers the tournament pages rely on to decide whether to
 * offer "Join".
 *
 * The pages used to treat a failed request as a definite "you are not
 * registered" and re-offer Join after a successful join. The fix rests on
 * three properties of the API, all asserted here:
 *
 *   1. not registered is a 200 carrying null — never an error, so the page can
 *      safely stop swallowing errors into null
 *   2. registered is a 200 carrying the registration
 *   3. `GET /players/me` reports `liveTournament` for the tournament just
 *      joined, which is how the list page knows to say "you're in" instead of
 *      offering Join again
 *
 * Needs the API running against the seeded dev data.
 *
 *   node scripts/qa-join-visibility.mjs
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'), override: true });

const BASE = process.env.API_URL || 'http://localhost:3000/api/v1';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = (s, p) => pool.query(s, p).then((r) => r.rows);
const c = { g: '\x1b[32m', r: '\x1b[31m', d: '\x1b[90m', b: '\x1b[1m', x: '\x1b[0m' };

const failures = [];
function check(label, ok, detail = '') {
  console.log(`  ${ok ? `${c.g}✓` : `${c.r}✗`}${c.x} ${label}${detail ? ` ${c.d}${detail}${c.x}` : ''}`);
  if (!ok) failures.push(label);
}

async function call(method, path, { body, token } = {}) {
  const headers = { Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, data: json.data, error: json.error, raw: json };
}
const login = async (email) =>
  (await call('POST', '/auth/login', { body: { email, password: 'password123' } })).data?.accessToken;

const admin = await login('admin@vrtournament.com');
if (!admin) { console.error('API not reachable, or the auth rate limit is spent.'); process.exit(1); }

const [hero] = await q(`SELECT id, email FROM users WHERE email='player25@vrtournament.com'`);
await q(`UPDATE matches SET status='expired' WHERE (player1_id=$1 OR player2_id=$1) AND status IN ('pending_confirmation','confirmed','in_progress')`, [hero.id]);
await q(`UPDATE tournament_participants SET status='out' WHERE user_id=$1 AND status<>'out'`, [hero.id]);
const token = await login(hero.email);
if (!token) { console.error('login rate-limited — wait ~15 minutes.'); process.exit(1); }

const [slot] = await q(
  `SELECT ts.id, ts.start_time FROM time_slots ts
    WHERE ts.status='available' AND ts.booked_count < ts.max_capacity
      AND ts.start_time > NOW() + INTERVAL '3 hours'
    ORDER BY ts.start_time LIMIT 1`
);
if (!slot) { console.error('No bookable time slot at least 3h ahead — run `pnpm seed`.'); process.exit(1); }

const startDate = new Date(new Date(slot.start_time).getTime() - 60 * 60_000);
const { data: t } = await call('POST', '/admin/tournaments', {
  token: admin,
  body: {
    name: `Join visibility ${Date.now()}`, game: 'VR Cricket',
    startDate: startDate.toISOString(),
    endDate: new Date(startDate.getTime() + 2 * 24 * 3600_000).toISOString(),
    registrationOpensAt: new Date(Date.now() - 3600_000).toISOString(),
    registrationClosesAt: startDate.toISOString(),
    roundDurationMinutes: 180, status: 'open',
  },
});
await call('POST', `/admin/tournaments/${t.id}/publish`, { token: admin });
console.log(`${c.b}Join visibility${c.x} ${c.d}tournament ${t.id}, player ${hero.email}${c.x}\n`);

console.log('before joining:');
const before = await call('GET', `/tournaments/${t.id}/registration`, { token });
check('not registered answers 200, not an error', before.status === 200, `${before.status}`);
check('…carrying an explicit null', before.data === null && 'data' in before.raw, `data=${JSON.stringify(before.data)}`);

console.log('\nafter joining:');
const entered = await call('POST', `/tournaments/${t.id}/enter`, { token, body: { timeSlotId: slot.id } });
check('enter succeeds', entered.status === 201, `${entered.status} ${entered.error?.message ?? ''}`);

const after = await call('GET', `/tournaments/${t.id}/registration`, { token });
check('registration reads back', after.status === 200 && !!after.data, `${after.status} ${after.data ? 'present' : 'null'}`);

// Ten in a row: the page re-reads this on every focus and invalidation, and a
// single null among them is what put the Join button back.
let nulls = 0;
for (let i = 0; i < 10; i++) {
  const r = await call('GET', `/tournaments/${t.id}/registration`, { token });
  if (r.status !== 200 || !r.data) nulls++;
}
check('stays present across repeated reads', nulls === 0, `${nulls}/10 came back empty`);

const me = await call('GET', '/players/me', { token });
check('players/me reports the tournament as live',
  me.data?.liveTournament?.id === t.id,
  `${me.data?.liveTournament?.id ?? 'null'}`);

console.log(
  `\n${c.d}The list page labels its button from liveTournament, the detail page from` +
  ` the registration read. Both now have a definite answer to work from.${c.x}`
);
console.log(failures.length ? `\n${c.r}${failures.length} failed${c.x}` : `\n${c.g}all good${c.x}`);
await pool.end();
process.exit(failures.length ? 1 : 0);
