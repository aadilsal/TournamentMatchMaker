/**
 * End-to-end VR walkthrough against the seeded dev data, in the exact order the
 * Quest app performs it. Prints the real request/response for every step so the
 * output can be handed to the VR team alongside docs/META_INTEGRATION_API.md.
 *
 *   node packages/db/scripts/qa-vr-walkthrough.mjs
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env'), override: true });

const BASE = process.env.API_URL || 'http://localhost:3000/api/v1';
const VR = `${BASE}/integrations/meta`;
const KEY = process.env.META_API_KEY;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = (s, p) => pool.query(s, p).then((r) => r.rows);

let step = 0;
const c = { dim: '\x1b[90m', g: '\x1b[32m', r: '\x1b[31m', b: '\x1b[1m', x: '\x1b[0m', y: '\x1b[33m' };
const problems = [];

async function call(label, method, path, { body, token, key = true } = {}) {
  const headers = { Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (key) headers['x-meta-api-key'] = KEY;
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${path.startsWith('http') ? '' : VR}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));

  console.log(`\n${c.b}${++step}. ${label}${c.x}`);
  console.log(`${c.dim}   ${method} ${path}${c.x}`);
  if (body) console.log(`${c.dim}   → ${JSON.stringify(body)}${c.x}`);
  const ok = res.status < 400;
  console.log(`   ${ok ? c.g : c.y}${res.status}${c.x} ${JSON.stringify(json.data ?? json.error)}`);
  return { status: res.status, data: json.data, error: json.error };
}

function expect(label, cond, detail = '') {
  if (cond) console.log(`   ${c.g}✓${c.x} ${label}`);
  else { console.log(`   ${c.r}✗ ${label}${c.x} ${detail}`); problems.push(`${label} ${detail}`); }
}

console.log(`${c.b}VR / Meta API — live walkthrough${c.x}`);
console.log(`${c.dim}base: ${VR}${c.x}`);

// ── seeded player who sits in the Karachi Open queue ────────────────────────
const [p5] = await q(`SELECT id, username, email FROM users WHERE email = 'player5@vrtournament.com'`);
if (!p5) { console.error('run `pnpm seed` first'); process.exit(1); }

const web = await fetch(`${BASE}/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: p5.email, password: 'password123' }),
}).then((r) => r.json());

// The walkthrough plays a full match through to completion, so re-running it
// would otherwise find the player out of the queue. Put them back at the start
// instead of requiring a re-seed between runs.
async function restoreQueuedState() {
  const [t] = await q(`SELECT id FROM tournaments WHERE name = 'Karachi Open VR'`);
  await q(
    `UPDATE matches SET status = 'completed'
     WHERE (player1_id = $1 OR player2_id = $1)
       AND status IN ('pending_confirmation','confirmed','in_progress')`, [p5.id]);
  await q(
    `UPDATE tournament_participants SET status = 'active', solo_target = NULL, solo_played_at = NULL
     WHERE user_id = $1 AND tournament_id = $2`, [p5.id, t.id]);

  // Migration 12: entering the queue requires a play window for the round.
  const [v] = await q(`SELECT id FROM venues LIMIT 1`);
  const [slot] = await q(
    `INSERT INTO time_slots (venue_id, start_time, end_time, max_capacity, booked_count)
     VALUES ($1, NOW() + INTERVAL '10 minutes', NOW() + INTERVAL '4 hours', 8, 0) RETURNING id`, [v.id]);
  await q(
    `INSERT INTO tournament_round_slots (tournament_id, user_id, round_number, time_slot_id, venue_id)
     VALUES ($1,$2,1,$3,$4)
     ON CONFLICT (tournament_id, user_id, round_number)
     DO UPDATE SET time_slot_id = EXCLUDED.time_slot_id`, [t.id, p5.id, slot.id, v.id]);

  await fetch(`${BASE}/matchmaking/queue`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${web.data.accessToken}` },
  });
  const join = await fetch(`${BASE}/matchmaking/queue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${web.data.accessToken}` },
    body: JSON.stringify({ tournamentId: t.id }),
  });
  if (!join.ok) {
    console.error(`could not queue ${p5.email}: ${join.status} ${await join.text()}`);
    process.exit(1);
  }
  return t.id;
}
await restoreQueuedState();

// ── 1. Identity: player reads a 4-digit code on the web, types it in VR ─────

const gen = await call('Web profile issues a link code (player is logged in on web)',
  'GET', `${BASE}/integrations/meta/link-code`, { token: web.data.accessToken, key: false });
expect('code is 4 digits', /^\d{4}$/.test(gen.data?.code ?? ''), gen.data?.code);
expect('expires in 10 minutes', gen.data?.expiresInSeconds === 600);

const verify = await call('Quest app exchanges the code for a userId',
  'POST', '/identity/verify-link-code', { body: { code: gen.data.code } });
expect('returns the right player', verify.data?.userId === p5.id);
expect('returns only userId + username',
  JSON.stringify(Object.keys(verify.data ?? {}).sort()) === '["userId","username"]');

const replay = await call('Same code again is rejected (single use)',
  'POST', '/identity/verify-link-code', { body: { code: gen.data.code } });
expect('replay rejected with CODE_INVALID', replay.status === 400 && replay.error?.code === 'CODE_INVALID');

const userId = verify.data.userId;

// ── 2. Poll while queued ────────────────────────────────────────────────────
const queued = await call('Poll current match while waiting in queue',
  'GET', `/matches/current?userId=${userId}`);
expect('inQueue is true', queued.data?.inQueue === true);
expect('tournamentId supplied for /solo-target', !!queued.data?.tournamentId);
expect('no match yet', queued.data?.match === null);

const tournamentId = queued.data?.tournamentId;

// ── 3. Solo innings while waiting ───────────────────────────────────────────
if (queued.data?.canSubmitSoloTarget && tournamentId) {
  const solo = await call('Player plays a solo innings and submits the target',
    'POST', '/solo-target', { body: { userId, tournamentId, target: 87 } });
  expect('accepted with 201', solo.status === 201);
  expect('stays in queue', solo.data?.inQueue === true);

  const dup = await call('Headset retries after a timeout (must not overwrite)',
    'POST', '/solo-target', { body: { userId, tournamentId, target: 12 } });
  expect('duplicate rejected with 409', dup.status === 409, `got ${dup.status}`);

  const after = await call('Poll again — solo UI must now be hidden',
    'GET', `/matches/current?userId=${userId}`);
  expect('canSubmitSoloTarget flipped to false', after.data?.canSubmitSoloTarget === false);
} else {
  console.log(`\n${c.y}   (player already has a solo target this round — skipping solo steps)${c.x}`);
}

// ── 4. Paired match: build one so the chase path is exercised ───────────────
const [opponent] = await q(
  `SELECT u.id, u.username FROM tournament_participants tp JOIN users u ON u.id = tp.user_id
   WHERE tp.tournament_id = $1 AND tp.user_id <> $2
     AND NOT EXISTS (
       SELECT 1 FROM matches m
       WHERE (m.player1_id = tp.user_id OR m.player2_id = tp.user_id)
         AND m.status IN ('pending_confirmation','confirmed','in_progress'))
   LIMIT 1`, [tournamentId, userId]);
if (!opponent) { console.error('no free opponent in this tournament'); process.exit(1); }
const [venue] = await q(`SELECT id, name FROM venues LIMIT 1`);
const [slot] = await q(
  `INSERT INTO time_slots (venue_id, start_time, end_time, max_capacity, booked_count)
   VALUES ($1, NOW() + INTERVAL '10 minutes', NOW() + INTERVAL '2 hours', 4, 0) RETURNING id`, [venue.id]);
const [match] = await q(
  `INSERT INTO matches (tournament_id, player1_id, player2_id, venue_id, time_slot_id, status, result, scheduled_at, round_number)
   VALUES ($1,$2,$3,$4,$5,'confirmed',$6, NOW() + INTERVAL '10 minutes', 1) RETURNING id`,
  [tournamentId, userId, opponent.id, venue.id, slot.id,
   // As pairing writes it: the setter's solo innings is already the scoreline's
   // first half, so the chaser is the only one with an innings left to play.
   JSON.stringify({ player1Score: 87, player2Score: null, winnerId: null, chaseTarget: 87, chasePlayerId: opponent.id })]);

const paired = await call('Poll again — now paired, chase mode',
  'GET', `/matches/current?userId=${userId}`);
const m = paired.data?.match;
expect('match is present', !!m);
expect('opponent is a plain username', m?.opponent === opponent.username, `${m?.opponent}`);
expect('venue is a plain name', m?.venue === venue.name, `${m?.venue}`);
expect('startTime / endTime are ISO 8601',
  !Number.isNaN(Date.parse(m?.startTime)) && !Number.isNaN(Date.parse(m?.endTime)));
expect('chaseTarget surfaced', m?.chaseTarget === 87, `${m?.chaseTarget}`);
expect('this player is the setter, not the chaser', m?.amChasing === false);
expect('setter already has their solo innings on the board',
  m?.myScore === 87 && m?.opponentScore === null, `${m?.myScore}/${m?.opponentScore}`);
expect('exactly the 10 documented fields',
  JSON.stringify(Object.keys(m ?? {}).sort()) ===
  JSON.stringify(['amChasing','amSettingTarget','chaseTarget','endTime','id','myScore','opponent','opponentScore','startTime','venue']),
  Object.keys(m ?? {}).join(','));

const oppView = await call('Opponent headset polls the same match',
  'GET', `/matches/current?userId=${opponent.id}`);
expect('opponent is the chaser', oppView.data?.match?.amChasing === true);
expect('both headsets see the same match id', oppView.data?.match?.id === m.id);

// ── 5. Scores ───────────────────────────────────────────────────────────────
// The setter has nothing left to submit — the innings they played alone is the
// target on the board — so the chaser's score is the one that ends the match.
const s1 = await call('Setter tries to bat a second time', 'POST', `/matches/${m.id}/scores`,
  { body: { userId, score: 90 } });
expect('rejected with 409 — solo target already stands as their score', s1.status === 409,
  `${s1.status}`);

const mid = await call('Poll mid-match', 'GET', `/matches/current?userId=${userId}`);
expect('myScore is the solo target', mid.data?.match?.myScore === 87);
expect('opponentScore still null', mid.data?.match?.opponentScore === null);

// both headsets finishing at the same instant — the case that used to lose a score
const race = await Promise.all([
  fetch(`${VR}/matches/${m.id}/scores`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-meta-api-key': KEY },
    body: JSON.stringify({ userId: opponent.id, score: 88 }) }).then((r) => r.status),
  fetch(`${VR}/matches/${m.id}/scores`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-meta-api-key': KEY },
    body: JSON.stringify({ userId: opponent.id, score: 88 }) }).then((r) => r.status),
]);
console.log(`\n${c.b}${++step}. Chaser's headset double-fires simultaneously${c.x}`);
console.log(`${c.dim}   POST /matches/${m.id}/scores  ×2 in parallel${c.x}`);
console.log(`   statuses: ${race.join(', ')}`);
expect('exactly one accepted', race.filter((s) => s === 200).length === 1, race.join('/'));

const [final] = await q(`SELECT status, result FROM matches WHERE id = $1`, [m.id]);
console.log(`   ${c.dim}db: status=${final.status} winner=${final.result?.winnerId ?? 'none'} p1=${final.result?.player1Score} p2=${final.result?.player2Score}${c.x}`);
expect('match resolved, no lost update', final.status === 'completed' && !!final.result?.winnerId,
  `status=${final.status}`);
expect('chaser 88 > target 87 → chaser wins', final.result?.winnerId === opponent.id);

const done = await call('Poll after the match finishes',
  'GET', `/matches/current?userId=${userId}`);
expect('match returns to null (stop polling / back to queue)', done.data?.match === null);

// ── 6. Auth failure modes ───────────────────────────────────────────────────
const noKey = await call('Request without the API key', 'GET',
  `/matches/current?userId=${userId}`, { key: false });
expect('rejected with 401', noKey.status === 401);

const badUser = await call('Malformed userId', 'GET', '/matches/current?userId=not-a-uuid');
expect('rejected with 400', badUser.status === 400);

const unknown = await call('Unknown but well-formed userId', 'GET',
  `/matches/current?userId=00000000-0000-0000-0000-0000000000ff`);
expect('200 with idle payload, not 404', unknown.status === 200 && unknown.data?.match === null);

console.log(`\n${'═'.repeat(64)}`);
if (problems.length === 0) {
  console.log(`${c.g}${c.b}Walkthrough clean — every documented VR step behaves as specified.${c.x}`);
} else {
  console.log(`${c.r}${c.b}${problems.length} problem(s):${c.x}`);
  for (const p of problems) console.log(`  ✗ ${p}`);
}
await pool.end();
process.exit(problems.length ? 1 : 0);
