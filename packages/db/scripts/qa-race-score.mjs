/** Isolated reproduction of the concurrent score-submit race. */
import pg from 'pg';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env'), override: true });

const API = 'http://localhost:3000/api/v1';
const KEY = process.env.META_API_KEY;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = (s, p) => pool.query(s, p).then((r) => r.rows);

const post = (path, body) =>
  fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-meta-api-key': KEY },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));

const tag = randomUUID().slice(0, 8);
const reg = async (i) => {
  const r = await fetch(`${API}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `race${i}_${tag}@qa.test`, password: 'password123',
      username: `race${i}_${tag}`, hasVrHeadset: true }),
  }).then((x) => x.json());
  return r.data.user.id;
};

const a = await reg(1), b = await reg(2);
const [v] = await q(`SELECT id FROM venues LIMIT 1`);
const [t] = await q(
  `INSERT INTO tournaments (name, game, start_date, end_date, status, max_players, skill_tier,
                            buyback_price_cents, phase, current_round_number, round_duration_minutes)
   VALUES ($1,'VR Cricket',NOW(),NOW()+INTERVAL '5 days','in_progress',64,3,500,'normal',1,180) RETURNING id`,
  [`Race ${tag}`]);

const run = async (n) => {
  const [slot] = await q(
    `INSERT INTO time_slots (venue_id, start_time, end_time, max_capacity, booked_count)
     VALUES ($1, NOW()+INTERVAL '1 hour', NOW()+INTERVAL '3 hours', 4, 0) RETURNING id`, [v.id]);
  const [m] = await q(
    `INSERT INTO matches (tournament_id, player1_id, player2_id, venue_id, time_slot_id, status, round_number)
     VALUES ($1,$2,$3,$4,$5,'confirmed',1) RETURNING id`, [t.id, a, b, v.id, slot.id]);

  // Same player fires N concurrent submissions with different scores.
  const scores = Array.from({ length: n }, (_, i) => 10 + i);
  const res = await Promise.all(scores.map((s) => post(`/integrations/meta/matches/${m.id}/scores`, { userId: a, score: s })));
  const ok = res.filter((r) => r.status === 200).length;
  const [row] = await q(`SELECT result, status FROM matches WHERE id = $1`, [m.id]);
  return { n, ok, statuses: res.map((r) => r.status).join(','), stored: row.result?.player1Score, status: row.status };
};

console.log('\nConcurrent submissions by the SAME player to the SAME match:\n');
for (const n of [2, 2, 3, 5, 8]) {
  const r = await run(n);
  const bad = r.ok > 1;
  console.log(`  ${String(r.n).padStart(2)} parallel → ${r.ok} accepted  [${r.statuses}]  stored=${r.stored}  ${bad ? '\x1b[31mRACE\x1b[0m' : 'ok'}`);
}

// Does it also let a player overwrite an ALREADY-FINAL match?
const [slot2] = await q(
  `INSERT INTO time_slots (venue_id, start_time, end_time, max_capacity, booked_count)
   VALUES ($1, NOW()+INTERVAL '1 hour', NOW()+INTERVAL '3 hours', 4, 0) RETURNING id`, [v.id]);
const [m2] = await q(
  `INSERT INTO matches (tournament_id, player1_id, player2_id, venue_id, time_slot_id, status, round_number)
   VALUES ($1,$2,$3,$4,$5,'confirmed',1) RETURNING id`, [t.id, a, b, v.id, slot2.id]);
const both = await Promise.all([
  post(`/integrations/meta/matches/${m2.id}/scores`, { userId: a, score: 10 }),
  post(`/integrations/meta/matches/${m2.id}/scores`, { userId: b, score: 20 }),
]);
const [fin] = await q(`SELECT result, status FROM matches WHERE id=$1`, [m2.id]);
console.log(`\n  Both players submit simultaneously → [${both.map((x) => x.status).join(',')}]`);
console.log(`  final status=${fin.status} winner=${fin.result?.winnerId ?? 'NONE'} p1=${fin.result?.player1Score} p2=${fin.result?.player2Score}`);
console.log(`  ${fin.status === 'completed' && fin.result?.winnerId ? 'ok — resolved' : '\x1b[31mLOST UPDATE — match never resolved\x1b[0m'}`);

await pool.end();
