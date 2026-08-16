/**
 * Explains why the players currently sitting in a matchmaking queue are not
 * being paired.
 *
 * "2 players in queue" and nothing happening has several possible causes that
 * look identical from the UI, so this replays the real pairing rules against
 * the live queue and names the one that actually fired.
 *
 *   node scripts/qa-why-no-pair.mjs                 # every non-empty queue
 *   node scripts/qa-why-no-pair.mjs <tournamentId>  # just one
 */
import pg from 'pg';
import { Redis } from 'ioredis';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env'), override: true });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL);
const q = (sql, p) => pool.query(sql, p).then((r) => r.rows);

const onlyTournament = process.argv[2] ?? null;
const now = Date.now();
const fmt = (ms) => (ms ? new Date(Number(ms)).toISOString().replace('T', ' ').slice(0, 19) : '—');

function overlaps(aStart, aEnd, bStart, bEnd) {
  if (aStart == null || aEnd == null || bStart == null || bEnd == null) return true;
  return Number(aStart) < Number(bEnd) && Number(bStart) < Number(aEnd);
}

/**
 * Who is entitled to play but is not in a queue at all.
 *
 * Starting from Redis — as the rest of this script does — cannot see the
 * failure that matters most: a tournament that goes live with a full field and
 * an empty queue. There is nothing to walk, so the old version printed "No
 * queues have anyone in them" and exited, which reads as "nothing to do" when it
 * actually means "nobody was ever entered". Start from the database instead.
 */
async function reportLiveTournaments() {
  const live = await q(
    `SELECT t.id, t.name, t.status, t.phase, t.current_round_number,
            t.start_date, t.registration_closes_at,
            r.status AS round_status, r.starts_at, r.ends_at
     FROM tournaments t
     LEFT JOIN tournament_rounds r
       ON r.tournament_id = t.id AND r.round_number = t.current_round_number
     WHERE t.status IN ('open', 'closed', 'in_progress')
     ORDER BY t.start_date`
  );
  if (live.length === 0) return;

  console.log(`${'='.repeat(78)}`);
  console.log('TOURNAMENTS AND WHO IS ACTUALLY IN MATCHMAKING');

  for (const t of live) {
    if (onlyTournament && t.id !== onlyTournament) continue;

    const roundOpen =
      t.round_status === 'active' &&
      t.starts_at &&
      new Date(t.starts_at).getTime() <= now &&
      new Date(t.ends_at).getTime() > now;

    console.log(`\n  ${t.name}  [${t.id}]`);
    console.log(`    status=${t.status} phase=${t.phase} currentRound=${t.current_round_number}`);
    console.log(`    starts ${fmt(new Date(t.start_date).getTime())}, registration shuts ${fmt(t.registration_closes_at && new Date(t.registration_closes_at).getTime())}`);
    if (!t.round_status) {
      console.log('    !! no tournament_rounds row for the current round — nothing can be paired');
    } else {
      console.log(
        `    round ${t.current_round_number}: status=${t.round_status} window ${fmt(new Date(t.starts_at).getTime())} .. ${fmt(new Date(t.ends_at).getTime())}` +
          (roundOpen ? '  (open now)' : '  !! NOT OPEN NOW — matchmaking will not run')
      );
    }

    const participants = await q(
      `SELECT tp.user_id, tp.status, tp.round_number, u.username, u.has_vr_headset,
              (SELECT COUNT(*)::int FROM matches m
                WHERE (m.player1_id = tp.user_id OR m.player2_id = tp.user_id)
                  AND m.status IN ('pending_confirmation','confirmed','in_progress')) AS live_matches,
              (SELECT ts.end_time FROM tournament_round_slots rs
                 JOIN time_slots ts ON ts.id = rs.time_slot_id
                WHERE rs.tournament_id = tp.tournament_id AND rs.user_id = tp.user_id
                  AND ts.end_time > NOW()
                ORDER BY (rs.round_number = tp.round_number) DESC, rs.round_number DESC
                LIMIT 1) AS slot_ends
       FROM tournament_participants tp
       JOIN users u ON u.id = tp.user_id
       WHERE tp.tournament_id = $1
       ORDER BY u.username`,
      [t.id]
    );

    if (participants.length === 0) {
      console.log('    no participants registered');
      continue;
    }

    for (const p of participants) {
      const inQueue = await redis.sismember('queue:member', p.user_id);
      const state = inQueue
        ? 'in queue'
        : p.live_matches > 0
          ? 'holds a match'
          : !['active', 'advanced'].includes(p.status)
            ? `not playable (${p.status})`
            : roundOpen
              ? 'NOT IN QUEUE — will not be paired'
              : 'not in queue (round not open yet)';
      console.log(
        `      ${String(p.username).padEnd(16)} ${state.padEnd(32)} slot=${p.slot_ends ? fmt(new Date(p.slot_ends).getTime()) : 'NONE'}`
      );
    }
  }
}

await reportLiveTournaments();

const queueKeys = (await redis.keys('queue:tournament:*')).filter((k) => k !== 'queue:tournament:ids');
const globalKey = 'queue:global';
if ((await redis.zcard(globalKey)) > 0) queueKeys.push(globalKey);

if (queueKeys.length === 0) {
  console.log('\nNo queues have anyone in them.');
  await redis.quit();
  await pool.end();
  process.exit(0);
}

for (const key of queueKeys) {
  const tournamentId = key.startsWith('queue:tournament:') ? key.slice('queue:tournament:'.length) : null;
  if (onlyTournament && tournamentId !== onlyTournament) continue;

  const userIds = await redis.zrange(key, 0, -1);
  if (userIds.length === 0) continue;

  const [t] = tournamentId
    ? await q(`SELECT id, name, status, phase, current_round_number FROM tournaments WHERE id = $1`, [tournamentId])
    : [{ name: 'Global (casual) queue', status: '—', phase: '—', current_round_number: null }];

  console.log(`\n${'='.repeat(78)}`);
  console.log(`QUEUE: ${t?.name ?? tournamentId}   (${userIds.length} player(s))`);
  if (tournamentId) console.log(`  tournament status=${t?.status} phase=${t?.phase} currentRound=${t?.current_round_number}`);

  const [round] = tournamentId
    ? await q(
        `SELECT round_number, status, starts_at, ends_at FROM tournament_rounds
         WHERE tournament_id = $1 AND round_number = $2`,
        [tournamentId, t?.current_round_number]
      )
    : [null];
  if (tournamentId) {
    console.log(
      round
        ? `  active round ${round.round_number}: status=${round.status} window ${fmt(new Date(round.starts_at).getTime())} .. ${fmt(new Date(round.ends_at).getTime())}`
        : '  !! no tournament_rounds row for the current round — the pairer cannot resolve a play window'
    );
  }

  const entries = [];
  for (const userId of userIds) {
    const meta = await redis.hgetall(`queue:player:${userId}`);
    const [u] = await q(`SELECT username, skill_tier, city, has_vr_headset FROM users WHERE id = $1`, [userId]);
    entries.push({
      userId,
      username: u?.username ?? userId.slice(0, 8),
      skillTier: Number(meta.skillTier ?? u?.skill_tier ?? 0),
      city: meta.city ?? u?.city ?? '',
      roundNumber: Number(meta.roundNumber ?? 1),
      joinedAt: Number(meta.joinedAt ?? now),
      slotId: meta.slotId || null,
      slotStartAt: meta.slotStartAt ? Number(meta.slotStartAt) : null,
      slotEndAt: meta.slotEndAt ? Number(meta.slotEndAt) : null,
      hasMeta: Object.keys(meta).length > 0,
    });
  }

  console.log('\n  PLAYERS IN QUEUE:');
  for (const e of entries) {
    console.log(
      `    ${e.username.padEnd(16)} tier=${e.skillTier} round=${e.roundNumber} ` +
        `waited=${Math.floor((now - e.joinedAt) / 1000)}s slot=${e.slotStartAt ? `${fmt(e.slotStartAt)} .. ${fmt(e.slotEndAt)}` : 'NONE'}` +
        (e.hasMeta ? '' : '   !! no queue:player hash — stale queue entry')
    );
  }

  if (entries.length < 2) {
    console.log('\n  => Only one player. Nothing to pair with yet.');
    continue;
  }

  console.log('\n  PAIR CHECKS:');
  let anyPairable = false;
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];
      const reasons = [];

      if (a.roundNumber !== b.roundNumber) {
        reasons.push(`different round (${a.roundNumber} vs ${b.roundNumber}) — never pairs`);
      }
      // Non-overlapping windows are only a preference now: the format is
      // asynchronous, one player sets a target and the other chases it, so they
      // never have to be in VR at the same moment. Reporting it as a blocker sent
      // people looking for a scheduling problem that was not there.
      if (!overlaps(a.slotStartAt, a.slotEndAt, b.slotStartAt, b.slotEndAt)) {
        console.log(`    note: ${a.username} and ${b.username} have non-overlapping windows (allowed, just scored lower)`);
      }

      // Tier tolerance only bites with 3+ players; with two it is always satisfied.
      const waited = Math.max(now - a.joinedAt, now - b.joinedAt) / 1000;
      const dist = Math.abs(a.skillTier - b.skillTier);
      if (waited < 10 && dist > 0 && entries.length > 2) {
        reasons.push(`tier gap ${dist} while waiting <10s (tolerance widens at 10s, then 30s)`);
      }

      // Worker-side: the chosen slot must sit inside the active round window.
      if (tournamentId && round) {
        const rs = new Date(round.starts_at).getTime();
        const re = new Date(round.ends_at).getTime();
        for (const e of [a, b]) {
          if (e.slotStartAt != null && (e.slotStartAt < rs || e.slotEndAt > re)) {
            reasons.push(
              `${e.username}'s slot falls outside the round window — the pairer discards it and reports "no slots"`
            );
          }
          if (e.slotEndAt != null && e.slotEndAt < now) {
            reasons.push(`${e.username}'s slot has already ended`);
          }
        }
        if (round.status !== 'active') {
          reasons.push(`round status is "${round.status}", not active — no play window can be resolved`);
        }
      }
      if (tournamentId && !round) {
        reasons.push('no active round row — the pairer rolls back with "no slots"');
      }

      if (reasons.length === 0) {
        anyPairable = true;
        console.log(`    ${a.username} + ${b.username}: PAIRABLE — should match within ~2s`);
      } else {
        console.log(`    ${a.username} + ${b.username}: BLOCKED`);
        for (const r of [...new Set(reasons)]) console.log(`        - ${r}`);
      }
    }
  }

  if (!anyPairable) {
    console.log('\n  => No pairable combination. Fix the reason above, or have the players re-enter.');
  }
}

// Is the worker actually consuming jobs?
console.log(`\n${'='.repeat(78)}`);
console.log('WORKER / QUEUE HEALTH');
const repeatKeys = await redis.keys('bull:matchmaking-jobs:repeat*');
const waiting = await redis.llen('bull:matchmaking-jobs:wait').catch(() => 0);
const active = await redis.llen('bull:matchmaking-jobs:active').catch(() => 0);
const failed = await redis.zcard('bull:matchmaking-jobs:failed').catch(() => 0);
console.log(`  repeatable job registered: ${repeatKeys.length > 0 ? 'yes' : 'NO — only join-triggered pairing runs'}`);
console.log(`  jobs waiting=${waiting} active=${active} failed=${failed}`);
if (failed > 0) {
  const ids = await redis.zrange('bull:matchmaking-jobs:failed', 0, 2);
  for (const id of ids) {
    const h = await redis.hgetall(`bull:matchmaking-jobs:${id}`);
    console.log(`  failed job ${id}: ${(h.failedReason ?? '').slice(0, 200)}`);
  }
}

await redis.quit();
await pool.end();
