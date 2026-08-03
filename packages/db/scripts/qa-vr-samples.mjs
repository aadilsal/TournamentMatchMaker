/** Captures real request/response samples for every VR API state. */
import pg from 'pg';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env'), override: true });

const BASE = 'http://localhost:3000/api/v1';
const VR = `${BASE}/integrations/meta`;
const KEY = process.env.META_API_KEY;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = (s, p) => pool.query(s, p).then((r) => r.rows);

async function show(label, method, path, body, { key = true } = {}) {
  const headers = { Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (key) headers['x-meta-api-key'] = KEY;
  const res = await fetch(path.startsWith('http') ? path : VR + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  console.log(`\n### ${label}`);
  console.log(`${method} ${path}`);
  if (body) console.log(`REQUEST  ${JSON.stringify(body)}`);
  console.log(`STATUS   ${res.status}`);
  console.log(`RESPONSE ${JSON.stringify(json, null, 2)}`);
  return json;
}

const [p5] = await q(`SELECT id, email FROM users WHERE email='player5@vrtournament.com'`);
const [t] = await q(`SELECT id FROM tournaments WHERE name='Karachi Open VR'`);
const web = await fetch(`${BASE}/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: p5.email, password: 'password123' }),
}).then((r) => r.json());

// reset to a clean queued state
await q(`UPDATE matches SET status='completed' WHERE (player1_id=$1 OR player2_id=$1)
         AND status IN ('pending_confirmation','confirmed','in_progress')`, [p5.id]);
await q(`UPDATE tournament_participants SET status='active', solo_target=NULL, solo_played_at=NULL
         WHERE user_id=$1 AND tournament_id=$2`, [p5.id, t.id]);
const [v] = await q(`SELECT id, name FROM venues LIMIT 1`);
const [rs] = await q(`INSERT INTO time_slots (venue_id,start_time,end_time,max_capacity,booked_count)
   VALUES ($1, NOW()+INTERVAL '15 minutes', NOW()+INTERVAL '4 hours', 8, 0) RETURNING id`, [v.id]);
await q(`INSERT INTO tournament_round_slots (tournament_id,user_id,round_number,time_slot_id,venue_id)
   VALUES ($1,$2,1,$3,$4) ON CONFLICT (tournament_id,user_id,round_number)
   DO UPDATE SET time_slot_id=EXCLUDED.time_slot_id`, [t.id, p5.id, rs.id, v.id]);
await fetch(`${BASE}/matchmaking/queue`, { method: 'DELETE',
  headers: { Authorization: `Bearer ${web.data.accessToken}` } });
await fetch(`${BASE}/matchmaking/queue`, { method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${web.data.accessToken}` },
  body: JSON.stringify({ tournamentId: t.id }) });

console.log('='.repeat(70));
console.log('A. IDENTITY');
console.log('='.repeat(70));
const gen = await show('Web app issues a link code (player JWT, no Meta key)',
  'GET', `${BASE}/integrations/meta/link-code`, null, { key: false });
await show('Quest exchanges the code for a userId', 'POST', '/identity/verify-link-code',
  { code: gen.data.code });
await show('Same code replayed — single use', 'POST', '/identity/verify-link-code',
  { code: gen.data.code });

console.log('\n' + '='.repeat(70));
console.log('B. GET /matches/current');
console.log('='.repeat(70));
await show('Queued, no match yet', 'GET', `/matches/current?userId=${p5.id}`);

await show('Solo innings submitted', 'POST', '/solo-target',
  { userId: p5.id, tournamentId: t.id, target: 87 });
await show('Retry of the same solo submission', 'POST', '/solo-target',
  { userId: p5.id, tournamentId: t.id, target: 42 });
await show('Queued, solo target already recorded', 'GET', `/matches/current?userId=${p5.id}`);

// build a chase-mode match
const [opp] = await q(
  `SELECT u.id, u.username FROM tournament_participants tp JOIN users u ON u.id=tp.user_id
   WHERE tp.tournament_id=$1 AND tp.user_id<>$2 AND NOT EXISTS (
     SELECT 1 FROM matches m WHERE (m.player1_id=tp.user_id OR m.player2_id=tp.user_id)
       AND m.status IN ('pending_confirmation','confirmed','in_progress')) LIMIT 1`, [t.id, p5.id]);
const [slot] = await q(`INSERT INTO time_slots (venue_id,start_time,end_time,max_capacity,booked_count)
   VALUES ($1, NOW()+INTERVAL '15 minutes', NOW()+INTERVAL '3 hours', 4, 0) RETURNING id`, [v.id]);
const [m] = await q(
  `INSERT INTO matches (tournament_id,player1_id,player2_id,venue_id,time_slot_id,status,result,scheduled_at,round_number)
   VALUES ($1,$2,$3,$4,$5,'confirmed',$6,NOW()+INTERVAL '15 minutes',1) RETURNING id`,
  [t.id, p5.id, opp.id, v.id, slot.id,
   JSON.stringify({ player1Score: null, player2Score: null, winnerId: null, chaseTarget: 87, chasePlayerId: opp.id })]);

await show('Paired — chase mode, this player SET the target', 'GET', `/matches/current?userId=${p5.id}`);
await show('Same match from the chaser\'s headset', 'GET', `/matches/current?userId=${opp.id}`);

console.log('\n' + '='.repeat(70));
console.log('C. POST /matches/:matchId/scores');
console.log('='.repeat(70));
await show('Setter submits', 'POST', `/matches/${m.id}/scores`, { userId: p5.id, score: 87 });
await show('Same headset submits again', 'POST', `/matches/${m.id}/scores`, { userId: p5.id, score: 90 });
await show('Poll mid-match', 'GET', `/matches/current?userId=${p5.id}`);
await show('Chaser submits — match completes', 'POST', `/matches/${m.id}/scores`,
  { userId: opp.id, score: 88 });
await show('Poll after completion', 'GET', `/matches/current?userId=${p5.id}`);

console.log('\n' + '='.repeat(70));
console.log('D. ERRORS');
console.log('='.repeat(70));
await show('No API key', 'GET', `/matches/current?userId=${p5.id}`, null, { key: false });
await show('Malformed userId', 'GET', '/matches/current?userId=abc');
await show('Unknown but valid userId', 'GET', '/matches/current?userId=00000000-0000-0000-0000-0000000000ff');
await show('Unknown matchId', 'POST', `/matches/00000000-0000-0000-0000-0000000000cc/scores`,
  { userId: p5.id, score: 10 });
await show('Score out of range', 'POST', `/matches/${m.id}/scores`, { userId: p5.id, score: 1000 });

await pool.end();
