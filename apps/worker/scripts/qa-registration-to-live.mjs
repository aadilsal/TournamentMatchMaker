/**
 * End-to-end check of the reported failure: two players who only *registered*
 * for a tournament, and the tournament going live.
 *
 * Before the enrolment job existed this ended with an empty queue, no match, no
 * notification and `GET /meta/matches/current` answering `not_queued` — the
 * exact report. It drives the real jobs, not copies of their SQL.
 *
 *   pnpm --filter @vr-tournament/worker exec node scripts/qa-registration-to-live.mjs
 *
 * Everything it creates is deleted again on the way out.
 */
import dotenv from 'dotenv';
import pg from 'pg';
import { Redis } from 'ioredis';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env'), override: true });

const { processTournamentLifecycleJob } = await import('../dist/jobs/tournament-lifecycle.job.js');
const { processEnrollParticipantsJob } = await import('../dist/jobs/enroll-participants.job.js');
const { processPairPlayersJob } = await import('../dist/jobs/pair-players.job.js');

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL);

const stamp = Date.now();
const notifications = [];
const notificationQueue = { add: async (_n, data) => notifications.push(data) };

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const ids = { users: [], tournament: null, tournament2: null, venue: null };

try {
  // --- Arrange: a tournament whose registration has just shut and whose start
  // --- time has just arrived, with two VR players who only registered.
  const venue = await pool.query(
    `INSERT INTO venues (name, city, country, address, location, active)
     VALUES ($1, 'Lahore', 'PK', 'QA', ST_SetSRID(ST_MakePoint(74.35, 31.52), 4326), true)
     RETURNING id`,
    [`QA Venue ${stamp}`]
  );
  ids.venue = venue.rows[0].id;

  for (let i = 1; i <= 2; i++) {
    const u = await pool.query(
      `INSERT INTO users (email, username, password_hash, has_vr_headset, city, country, skill_tier)
       VALUES ($1, $2, 'x', true, 'Lahore', 'PK', 3) RETURNING id`,
      [`qa_reg_${stamp}_${i}@test.local`, `qa_reg_${stamp}_${i}`]
    );
    ids.users.push(u.rows[0].id);
  }

  const t = await pool.query(
    `INSERT INTO tournaments (name, game, start_date, end_date,
                              registration_opens_at, registration_closes_at,
                              status, skill_tier, round_duration_minutes, current_round_number)
     VALUES ($1, 'pixel-paddle',
             NOW() - INTERVAL '1 minute', NOW() + INTERVAL '2 days',
             NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 minute',
             'open', 3, 180, 1)
     RETURNING id`,
    [`QA Registration→Live ${stamp}`]
  );
  ids.tournament = t.rows[0].id;

  // Round 1 exactly as `TournamentsService.create` writes it.
  await pool.query(
    `INSERT INTO tournament_rounds (tournament_id, round_number, starts_at, ends_at, status)
     SELECT id, 1, start_date, start_date + make_interval(mins => round_duration_minutes), 'active'
     FROM tournaments WHERE id = $1`,
    [ids.tournament]
  );

  // A play window inside the round, offered by the venue but never chosen by
  // either player — they only registered.
  await pool.query(
    `INSERT INTO time_slots (venue_id, start_time, end_time, max_capacity, booked_count, status)
     SELECT $1, r.starts_at + INTERVAL '5 minutes', r.starts_at + INTERVAL '65 minutes', 4, 0, 'available'
     FROM tournament_rounds r WHERE r.tournament_id = $2 AND r.round_number = 1`,
    [ids.venue, ids.tournament]
  );

  for (const userId of ids.users) {
    await pool.query(
      `INSERT INTO tournament_registrations (tournament_id, user_id) VALUES ($1, $2)`,
      [ids.tournament, userId]
    );
    await pool.query(
      `INSERT INTO tournament_participants (tournament_id, user_id, status, round_number)
       VALUES ($1, $2, 'active', 1)`,
      [ids.tournament, userId]
    );
  }

  const queued = async () =>
    (await Promise.all(ids.users.map((u) => redis.sismember('queue:member', u)))).filter(Boolean).length;

  check('nobody is in matchmaking before the tournament starts', (await queued()) === 0);

  // --- Act: the lifecycle sweep, then enrolment, then pairing.
  await processTournamentLifecycleJob({}, pool, redis);

  const status = await pool.query(`SELECT status FROM tournaments WHERE id = $1`, [ids.tournament]);
  check('tournament goes open → closed → in_progress', status.rows[0].status === 'in_progress', status.rows[0].status);

  await processEnrollParticipantsJob({}, pool, redis, notificationQueue);
  check('both registered players are put into matchmaking', (await queued()) === 2, `${await queued()} of 2`);
  check(
    'both are told the tournament is live',
    notifications.filter((n) => n.type === 'tournament_live').length === 2,
    `${notifications.filter((n) => n.type === 'tournament_live').length}`
  );

  await processPairPlayersJob({}, pool, redis, {}, notificationQueue, ids.tournament);

  const match = await pool.query(
    `SELECT m.id, m.status, m.time_slot_id, m.venue_id, m.round_number, ts.start_time, ts.end_time
     FROM matches m LEFT JOIN time_slots ts ON ts.id = m.time_slot_id
     WHERE m.tournament_id = $1`,
    [ids.tournament]
  );
  check('a match is created for the pair', match.rowCount === 1, `${match.rowCount} match(es)`);

  const m = match.rows[0];
  if (m) {
    check('the match is confirmed, not left awaiting confirmation', m.status === 'confirmed', m.status);
    check('the match has a play window both players can score in', !!m.time_slot_id);
    check('two VR players are given a time, not a venue', m.venue_id === null);
    check('the match belongs to round 1', m.round_number === 1, `${m.round_number}`);
  }

  check(
    'both players are told their match was found',
    notifications.filter((n) => n.type === 'match_found').length === 2,
    `${notifications.filter((n) => n.type === 'match_found').length}`
  );
  check('both players leave the queue once matched', (await queued()) === 0);

  // --- Re-running must not produce a second match for the same players.
  await processEnrollParticipantsJob({}, pool, redis, notificationQueue);
  check('a player holding a match is not re-enrolled', (await queued()) === 0);

  const finalCount = await pool.query(`SELECT COUNT(*)::int AS c FROM matches WHERE tournament_id = $1`, [
    ids.tournament,
  ]);
  check('no duplicate match is created', finalCount.rows[0].c === 1, `${finalCount.rows[0].c}`);

  // --- Same story for two players who attend a venue in person. They consume a
  // --- seat, so the slot has to come back out of `locked` and both have to end
  // --- up with a booking for it.
  console.log('\n  venue players (no headset, no slot chosen)');

  for (let i = 3; i <= 4; i++) {
    const u = await pool.query(
      `INSERT INTO users (email, username, password_hash, has_vr_headset, city, country, latitude, longitude, skill_tier)
       VALUES ($1, $2, 'x', false, 'Lahore', 'PK', 31.52, 74.35, 3) RETURNING id`,
      [`qa_reg_${stamp}_${i}@test.local`, `qa_reg_${stamp}_${i}`]
    );
    ids.users.push(u.rows[0].id);
  }
  const venuePlayers = ids.users.slice(2);

  const t2 = await pool.query(
    `INSERT INTO tournaments (name, game, start_date, end_date,
                              registration_opens_at, registration_closes_at,
                              status, skill_tier, round_duration_minutes, current_round_number)
     VALUES ($1, 'pixel-paddle', NOW() - INTERVAL '1 minute', NOW() + INTERVAL '2 days',
             NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 minute',
             'in_progress', 3, 180, 1)
     RETURNING id`,
    [`QA Venue Players ${stamp}`]
  );
  ids.tournament2 = t2.rows[0].id;

  await pool.query(
    `INSERT INTO tournament_rounds (tournament_id, round_number, starts_at, ends_at, status)
     SELECT id, 1, NOW(), NOW() + make_interval(mins => round_duration_minutes), 'active'
     FROM tournaments WHERE id = $1`,
    [ids.tournament2]
  );
  // A slot that has not started yet, so venue players may still take a seat.
  await pool.query(
    `INSERT INTO time_slots (venue_id, start_time, end_time, max_capacity, booked_count, status)
     VALUES ($1, NOW() + INTERVAL '20 minutes', NOW() + INTERVAL '80 minutes', 4, 0, 'available')`,
    [ids.venue]
  );

  for (const userId of venuePlayers) {
    await pool.query(`INSERT INTO tournament_registrations (tournament_id, user_id) VALUES ($1, $2)`, [
      ids.tournament2,
      userId,
    ]);
    await pool.query(
      `INSERT INTO tournament_participants (tournament_id, user_id, status, round_number)
       VALUES ($1, $2, 'active', 1)`,
      [ids.tournament2, userId]
    );
  }

  await processEnrollParticipantsJob({}, pool, redis, notificationQueue);
  await processPairPlayersJob({}, pool, redis, {}, notificationQueue, ids.tournament2);

  const vm = await pool.query(
    `SELECT m.id, m.status, m.venue_id, m.time_slot_id, ts.status AS slot_status, ts.booked_count
     FROM matches m JOIN time_slots ts ON ts.id = m.time_slot_id
     WHERE m.tournament_id = $1`,
    [ids.tournament2]
  );
  check('venue players are paired too', vm.rowCount === 1, `${vm.rowCount} match(es)`);
  if (vm.rows[0]) {
    check('the match is given a venue', !!vm.rows[0].venue_id);
    check(
      'the slot is released from "locked" once the match is booked',
      vm.rows[0].slot_status !== 'locked',
      vm.rows[0].slot_status
    );
    check('both attendees hold a seat', vm.rows[0].booked_count === 2, `${vm.rows[0].booked_count}`);

    const bookings = await pool.query(
      `SELECT COUNT(*)::int AS c FROM bookings
       WHERE time_slot_id = $1 AND user_id = ANY($2) AND status = 'confirmed'`,
      [vm.rows[0].time_slot_id, venuePlayers]
    );
    check('a confirmed booking exists for each attendee', bookings.rows[0].c === 2, `${bookings.rows[0].c}`);
  }
} catch (err) {
  console.error('ERROR:', err);
  failures++;
} finally {
  for (const u of ids.users) {
    await redis.del(`queue:player:${u}`);
    await redis.srem('queue:member', u);
  }
  if (ids.tournament) {
    await redis.del(`queue:tournament:${ids.tournament}`);
    await redis.srem('queue:tournament:ids', ids.tournament);
  }
  if (ids.users.length) {
    // matches.tournament_id is ON DELETE SET NULL, so the rows outlive the
    // tournament and hold a reference to the players. Clear them first.
    await pool.query(`DELETE FROM matches WHERE player1_id = ANY($1) OR player2_id = ANY($1)`, [
      ids.users,
    ]);
  }
  for (const tid of [ids.tournament, ids.tournament2].filter(Boolean)) {
    await redis.del(`queue:tournament:${tid}`);
    await redis.srem('queue:tournament:ids', tid);
    await pool.query(`DELETE FROM tournaments WHERE id = $1`, [tid]);
  }
  if (ids.users.length) {
    await pool.query(`DELETE FROM bookings WHERE user_id = ANY($1)`, [ids.users]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [ids.users]);
  }
  if (ids.venue) {
    await pool.query(`DELETE FROM time_slots WHERE venue_id = $1`, [ids.venue]);
    await pool.query(`DELETE FROM venues WHERE id = $1`, [ids.venue]);
  }
  await redis.quit();
  await pool.end();
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
