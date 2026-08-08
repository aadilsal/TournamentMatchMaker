/**
 * Traces every input that decides `canSubmitSoloTarget` in
 * GET /integrations/meta/matches/current, so a flag that flips true/false/true
 * between identical polls can be pinned on the exact input that moved.
 *
 *   node scripts/qa-solo-flag-trace.mjs                 # every queued player, once
 *   node scripts/qa-solo-flag-trace.mjs <userId>        # one player, once
 *   node scripts/qa-solo-flag-trace.mjs <userId> watch  # poll every 2s
 */
import pg from 'pg';
import { Redis } from 'ioredis';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

const QUEUE_MEMBER = 'queue:member';
const arg = process.argv[2];
const watch = process.argv[3] === 'watch' || arg === 'watch';
const targetUser = arg && arg !== 'watch' ? arg : null;

async function snapshot(userId) {
  const activeMatch = await pool.query(
    `SELECT m.id, m.tournament_id, m.status, m.round_number, m.created_at
       FROM matches m
      WHERE (m.player1_id = $1 OR m.player2_id = $1)
        AND m.status IN ('pending_confirmation','confirmed','in_progress')
      ORDER BY (m.status <> 'pending_confirmation') DESC, m.created_at DESC`,
    [userId]
  );
  const row = activeMatch.rows[0] ?? null;

  const inQueue = await redis.sismember(QUEUE_MEMBER, userId);
  const meta = await redis.hgetall(`queue:player:${userId}`);
  const tid = meta.tournamentId || null;

  // Exactly the query meta.service.ts runs — but every matching row, unordered,
  // so a duplicate or ambiguous match shows up instead of being silently picked.
  let roundRows = [];
  if (tid) {
    const r = await pool.query(
      `SELECT tp.round_number AS tp_round, tp.status AS tp_status, tp.solo_target,
              tr.round_number AS tr_round, tr.status AS tr_status,
              tr.starts_at, tr.ends_at, NOW() AS db_now
         FROM tournament_participants tp
         JOIN tournament_rounds tr
           ON tr.tournament_id = tp.tournament_id AND tr.round_number = tp.round_number
        WHERE tp.tournament_id = $1 AND tp.user_id = $2 AND tr.status = 'active'`,
      [tid, userId]
    );
    roundRows = r.rows;
  }

  let allRounds = [];
  if (tid) {
    const r = await pool.query(
      `SELECT round_number, status, starts_at, ends_at FROM tournament_rounds
        WHERE tournament_id = $1 ORDER BY round_number`,
      [tid]
    );
    allRounds = r.rows;
  }

  const first = roundRows[0];
  const canSubmit =
    !row &&
    !!tid &&
    !meta.soloTarget &&
    !!first &&
    first.solo_target == null &&
    new Date(first.ends_at).getTime() > Date.now();

  return { userId, row, allMatches: activeMatch.rows, inQueue, meta, tid, roundRows, allRounds, canSubmit };
}

function render(s) {
  const t = new Date().toISOString().slice(11, 23);
  console.log(`\n[${t}] user ${s.userId}  →  canSubmitSoloTarget = ${s.canSubmit}`);
  console.log(`  gate 1  no active match        : ${!s.row}  ${s.row ? `(blocked by ${s.row.status} match ${s.row.id})` : ''}`);
  if (s.allMatches.length > 1) {
    console.log(`          ⚠ ${s.allMatches.length} open matches: ${s.allMatches.map((m) => `${m.status}/${m.id.slice(0, 8)}`).join(', ')}`);
  }
  console.log(`  gate 2  in queue set           : ${s.inQueue === 1}`);
  console.log(`  gate 3  queue hash tournamentId: ${s.tid ?? 'null'}${s.tid ? '' : `  (hash keys: ${Object.keys(s.meta).join(',') || 'EMPTY'})`}`);
  console.log(`  gate 4  redis soloTarget unset : ${!s.meta.soloTarget}  (value=${JSON.stringify(s.meta.soloTarget ?? null)}, roundNumber=${s.meta.roundNumber ?? '-'})`);
  console.log(`  gate 5  active round row found : ${s.roundRows.length === 1 ? 'yes' : s.roundRows.length === 0 ? 'NO ROW' : `⚠ ${s.roundRows.length} ROWS`}`);
  for (const r of s.roundRows) {
    const left = Math.round((new Date(r.ends_at).getTime() - Date.now()) / 1000);
    console.log(
      `          tp.round=${r.tp_round} tp.status=${r.tp_status} solo_target=${r.solo_target ?? 'null'} | tr.round=${r.tr_round} ends_at=${new Date(r.ends_at).toISOString()} (${left}s left) db_now=${new Date(r.db_now).toISOString()}`
    );
  }
  if (s.allRounds.length) {
    console.log(`  rounds  : ${s.allRounds.map((r) => `#${r.round_number}:${r.status}(${new Date(r.ends_at).toISOString().slice(11, 19)})`).join('  ')}`);
  }
}

async function run() {
  const users = targetUser ? [targetUser] : await redis.smembers(QUEUE_MEMBER);
  if (!users.length) {
    console.log('No players in queue:member. Pass a userId explicitly to trace one anyway.');
    return;
  }
  for (const u of users) render(await snapshot(u));
}

await run();
if (watch) {
  setInterval(run, 2000);
} else {
  await pool.end();
  redis.disconnect();
}
