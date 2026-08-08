/**
 * Checks that a round rollover leaves a queued player able to play again.
 *
 * A round ending resets the per-round state in two places at once — the
 * participant row and the player's `queue:player:*` hash — and when those
 * disagree the player is stranded: `canSubmitSoloTarget` stays false,
 * `POST /solo-target` answers "already submitted for this round" for a round
 * they never played, and pairing discards them because the hash still names the
 * round that just closed.
 *
 * Needs the API and worker running against the seeded dev data.
 *
 *   node scripts/qa-round-rollover.mjs
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Redis } from 'ioredis';

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'), override: true });

const BASE = process.env.API_URL || 'http://localhost:3000/api/v1';
const KEY = process.env.META_API_KEY;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
const q = (s, p) => pool.query(s, p).then((r) => r.rows);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const c = { g: '\x1b[32m', r: '\x1b[31m', d: '\x1b[90m', b: '\x1b[1m', x: '\x1b[0m' };

const failures = [];
function check(label, ok, detail = '') {
  console.log(`  ${ok ? `${c.g}✓` : `${c.r}✗`}${c.x} ${label}${detail ? ` ${c.d}${detail}${c.x}` : ''}`);
  if (!ok) failures.push(label);
}

async function call(method, path, { body, token, key } = {}) {
  const headers = { Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (key) headers['x-meta-api-key'] = KEY;
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, data: json.data, error: json.error };
}
const login = async (email) =>
  (await call('POST', '/auth/login', { body: { email, password: 'password123' } })).data?.accessToken;

const admin = await login('admin@vrtournament.com');
if (!admin) { console.error('API not reachable, or dev data not seeded — run `pnpm seed`.'); process.exit(1); }

// A field of five so the close takes the normal (advance) branch rather than
// tipping straight into knockout, and only the first registrant queues, so no
// pairing consumes the player being watched.
const field = await q(`SELECT id, email FROM users WHERE has_vr_headset = true AND role='player' ORDER BY created_at LIMIT 5`);
for (const p of field) {
  await q(`UPDATE matches SET status='expired' WHERE (player1_id=$1 OR player2_id=$1) AND status IN ('pending_confirmation','confirmed','in_progress')`, [p.id]);
  await q(`UPDATE tournament_participants SET status='out' WHERE user_id=$1 AND status<>'out'`, [p.id]);
  p.token = await login(p.email);
  // Running this back to back trips the per-account login limiter, and the
  // resulting 401s look like a broken fixture rather than a spent budget.
  if (!p.token) {
    console.error(`setup: could not log in as ${p.email} — the auth rate limit is per account and holds for ~15 minutes.`);
    process.exit(1);
  }
}
const hero = field[0];

// Far enough ahead that registration is still open by the time the field has
// signed up: the round is anchored an hour before the slot, and other QA runs
// leave slots as little as an hour out, which would put this tournament's
// registration deadline in the past before the first player registered.
const [slot] = await q(
  `SELECT ts.id, ts.start_time FROM time_slots ts
    WHERE ts.status='available' AND ts.booked_count < ts.max_capacity
      AND ts.start_time > NOW() + INTERVAL '3 hours'
    ORDER BY ts.start_time LIMIT 1`
);
if (!slot) { console.error('No bookable time slot at least 3h ahead — run `pnpm seed`.'); process.exit(1); }

const startDate = new Date(new Date(slot.start_time).getTime() - 60 * 60_000);
const { data: tournament } = await call('POST', '/admin/tournaments', {
  token: admin,
  body: {
    name: `Round rollover check ${Date.now()}`,
    game: 'VR Cricket',
    startDate: startDate.toISOString(),
    endDate: new Date(startDate.getTime() + 2 * 24 * 3600_000).toISOString(),
    registrationOpensAt: new Date(Date.now() - 3600_000).toISOString(),
    registrationClosesAt: startDate.toISOString(),
    roundDurationMinutes: 180,
    status: 'open',
  },
});
const tid = tournament?.id;
if (!tid) { console.error('could not create the tournament:', JSON.stringify(tournament)); process.exit(1); }
await call('POST', `/admin/tournaments/${tid}/publish`, { token: admin });

// The setup is asserted rather than assumed: a field that fails to register, or
// a hero that never reaches the queue, otherwise shows up as a dozen unrelated
// failures further down and sends you looking in the wrong place.
for (const p of field) {
  const reg = await call('POST', `/tournaments/${tid}/register`, { token: p.token, body: {} });
  if (reg.status !== 201) { console.error(`setup: ${p.email} could not register — ${reg.status} ${reg.error?.message}`); process.exit(1); }
}
const entered = await call('POST', `/tournaments/${tid}/enter`, { token: hero.token, body: { timeSlotId: slot.id } });
if (entered.status !== 201) {
  console.error(`setup: ${hero.email} could not enter — ${entered.status} ${entered.error?.message}`);
  process.exit(1);
}

const current = () => call('GET', `/integrations/meta/matches/current?userId=${hero.id}`, { key: true });

console.log(`${c.b}Round rollover${c.x} ${c.d}tournament ${tid}, player ${hero.email}${c.x}\n`);

console.log('round 1, queued:');
const opening = (await current()).data;
check('canSubmitSoloTarget is true', opening?.canSubmitSoloTarget === true);
check('soloTargetState is available', opening?.soloTargetState === 'available', `got ${opening?.soloTargetState}`);

const solo = await call('POST', '/integrations/meta/solo-target', {
  key: true, body: { userId: hero.id, tournamentId: tid, target: 87 },
});
check('solo target accepted', solo.status === 201, `${solo.status} ${solo.error?.message ?? ''}`);
const played = (await current()).data;
check('flag drops once the innings is recorded', played?.canSubmitSoloTarget === false);
check('soloTargetState explains it as already_played', played?.soloTargetState === 'already_played', `got ${played?.soloTargetState}`);

console.log('\nround 1 expires:');
await q(`UPDATE tournament_rounds SET ends_at = NOW() - INTERVAL '5 seconds' WHERE tournament_id=$1 AND round_number=1`, [tid]);
await q(`UPDATE tournaments SET status='in_progress' WHERE id=$1`, [tid]);

// The first poll past the boundary is what asks for the close, so the wait
// below measures the on-demand path, not the background sweep.
const atBoundary = (await current()).data;
check('soloTargetState reports the changeover', atBoundary?.soloTargetState === 'round_closed', `got ${atBoundary?.soloTargetState}`);

const startedWaiting = Date.now();
let advanced = false;
for (let i = 0; i < 20 && !advanced; i++) {
  await sleep(1_000);
  await current(); // a real client keeps polling; so does this
  const [p] = await q(`SELECT round_number FROM tournament_participants WHERE tournament_id=$1 AND user_id=$2`, [tid, hero.id]);
  advanced = p?.round_number > 1;
}
// The poll itself asks for the close, so this measures the on-demand path. If
// it ever creeps back up towards the 15s sweep interval, that request is being
// dropped somewhere between the API and the worker.
const waited = Math.round((Date.now() - startedWaiting) / 1000);
check('the changeover clears on demand, not on the sweep', advanced && waited <= 3, `${waited}s`);

console.log('\nround 2:');
const after = (await current()).data;
const [part] = await q(`SELECT round_number, solo_target FROM tournament_participants WHERE tournament_id=$1 AND user_id=$2`, [tid, hero.id]);
const hash = await redis.hgetall(`queue:player:${hero.id}`);

check('participant solo target cleared', part?.solo_target === null, `got ${part?.solo_target}`);
check('queue hash solo target cleared', !hash.soloTarget, `got "${hash.soloTarget}"`);
check('queue hash round number follows the participant',
  Number(hash.roundNumber) === part?.round_number, `hash ${hash.roundNumber} vs db ${part?.round_number}`);
check('canSubmitSoloTarget is true again', after?.canSubmitSoloTarget === true);
check('soloTargetState is available again', after?.soloTargetState === 'available', `got ${after?.soloTargetState}`);

const retry = await call('POST', '/integrations/meta/solo-target', {
  key: true, body: { userId: hero.id, tournamentId: tid, target: 99 },
});
check('a fresh innings is accepted in the new round', retry.status === 201, `${retry.status} ${retry.error?.message ?? ''}`);

// Rounds are back to back. Starting the new one whenever the sweep noticed
// pushed the published schedule later on every round.
const [r1, r2] = await q(
  `SELECT round_number, starts_at, ends_at FROM tournament_rounds WHERE tournament_id=$1 ORDER BY round_number`,
  [tid]
);
check('the new round starts exactly where the old one ended',
  r2 && new Date(r2.starts_at).getTime() === new Date(r1.ends_at).getTime(),
  `${r1 && new Date(r1.ends_at).toISOString()} → ${r2 && new Date(r2.starts_at).toISOString()}`);

// ── a field of one has nothing left to play ────────────────────────────────
console.log('\nlast player standing:');
const loner = field[4];
await q(`UPDATE tournament_participants SET status='out' WHERE user_id=$1 AND status<>'out'`, [loner.id]);
const soloT = await call('POST', '/admin/tournaments', {
  token: admin,
  body: {
    name: `Last player standing ${Date.now()}`, game: 'VR Cricket',
    startDate: startDate.toISOString(),
    endDate: new Date(startDate.getTime() + 2 * 24 * 3600_000).toISOString(),
    registrationOpensAt: new Date(Date.now() - 3600_000).toISOString(),
    registrationClosesAt: startDate.toISOString(),
    roundDurationMinutes: 180, status: 'open',
  },
});
const soloTid = soloT.data.id;
await call('POST', `/admin/tournaments/${soloTid}/publish`, { token: admin });
const lonerReg = await call('POST', `/tournaments/${soloTid}/register`, { token: loner.token, body: {} });
check('single entrant registered', lonerReg.status === 201, `${lonerReg.status} ${lonerReg.error?.message ?? ''}`);

await q(`UPDATE tournament_rounds SET ends_at = NOW() - INTERVAL '5 seconds' WHERE tournament_id=$1 AND round_number=1`, [soloTid]);
await q(`UPDATE tournaments SET status='in_progress' WHERE id=$1`, [soloTid]);

let done = null;
for (let i = 0; i < 20 && !done; i++) {
  await sleep(1_000);
  const [row] = await q(`SELECT status, phase FROM tournaments WHERE id=$1`, [soloTid]);
  if (row.status === 'completed' || row.phase === 'knockout') done = row;
}
check('a one-player field completes rather than opening an empty knockout',
  done?.status === 'completed' && done?.phase === 'completed',
  `status=${done?.status} phase=${done?.phase}`);
const ko = await q(`SELECT COUNT(*)::int c FROM matches WHERE tournament_id=$1 AND phase='knockout'`, [soloTid]);
check('no knockout matches were invented for it', ko[0].c === 0, `${ko[0].c}`);
const lonerRow = await q(`SELECT status FROM tournament_participants WHERE tournament_id=$1 AND user_id=$2`, [soloTid, loner.id]);
check('the winner is released to enter another tournament', lonerRow[0]?.status === 'out', `${lonerRow[0]?.status}`);

console.log(failures.length ? `\n${c.r}${failures.length} failed${c.x}` : `\n${c.g}all good${c.x}`);
await pool.end();
redis.disconnect();
process.exit(failures.length ? 1 : 0);
