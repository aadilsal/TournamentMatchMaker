import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'), override: true });
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { Redis } from 'ioredis';
import {
  buildQueuePlayerHash,
  DEFAULT_RATING_POINTS,
  pointsToTier,
  queuePlayerKey,
  queueTournamentKey,
  QUEUE_MEMBER,
  QUEUE_TOURNAMENT_INDEX,
} from '@vr-tournament/shared';

const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const KNOCKOUT = { ro16: 100, qf: 101, sf: 102, final: 103 } as const;

const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  Lahore: { lat: 31.5204, lng: 74.3587 },
  Karachi: { lat: 24.8607, lng: 67.0011 },
  Islamabad: { lat: 33.7215, lng: 73.0433 },
};

const venues = [
  {
    name: 'VR Arena Lahore',
    address: 'MM Alam Road, Gulberg III',
    city: 'Lahore',
    country: 'Pakistan',
    lat: 31.5204,
    lng: 74.3587,
    capacity: 12,
  },
  {
    name: 'GameZone VR Hub',
    address: 'DHA Phase 5',
    city: 'Lahore',
    country: 'Pakistan',
    lat: 31.4697,
    lng: 74.2728,
    capacity: 8,
  },
  {
    name: 'Tekken VR Lounge',
    address: 'Johar Town Block H',
    city: 'Lahore',
    country: 'Pakistan',
    lat: 31.4692,
    lng: 74.2721,
    capacity: 10,
  },
  {
    name: 'Karachi VR Center',
    address: 'Clifton Block 5',
    city: 'Karachi',
    country: 'Pakistan',
    lat: 24.8138,
    lng: 67.0298,
    capacity: 15,
  },
  {
    name: 'Sindh Gaming Arena',
    address: 'PECHS Block 6',
    city: 'Karachi',
    country: 'Pakistan',
    lat: 24.8607,
    lng: 67.0731,
    capacity: 10,
  },
  {
    name: 'Capital VR Stadium',
    address: 'F-7 Markaz',
    city: 'Islamabad',
    country: 'Pakistan',
    lat: 33.7215,
    lng: 73.0433,
    capacity: 14,
  },
];

const EXTRA_PLAYER_NAMES = [
  'babar_vr',
  'shaheen_bowl',
  'rizwan_keep',
  'faf_power',
  'imam_lefty',
  'haris_pace',
  'shadab_spin',
  'naseem_fast',
  'iftikhar_hit',
  'saim_open',
  'abdullah_mid',
  'salman_all',
  'usama_wk',
  'mir_haider',
  'azam_khi',
  'hassan_isb',
  'tariq_vr',
  'zain_quest',
  'omar_meta',
  'ali_pico',
];

type PoolClient = pg.PoolClient;

interface MatchSeed {
  tournamentId?: string | null;
  player1Id: string;
  player2Id: string;
  venueId?: string | null;
  timeSlotId?: string | null;
  status: string;
  result?: { player1Score: number; player2Score: number; winnerId: string | null } | null;
  scheduledAt?: Date;
  roundNumber?: number;
  phase?: 'normal' | 'knockout';
  bracketSlot?: number;
}

async function upsertUser(
  client: PoolClient,
  passwordHash: string,
  email: string,
  username: string,
  city: string,
  hasVr: boolean,
  ratingPoints: number = DEFAULT_RATING_POINTS,
  vrDevice: string | null = null
) {
  const coords = CITY_COORDS[city] ?? CITY_COORDS.Lahore;
  const skillTier = pointsToTier(ratingPoints);
  const result = await client.query(
    `INSERT INTO users (email, password_hash, username, country, city, has_vr_headset, vr_device_type, skill_tier, rating_points, latitude, longitude)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (email) DO UPDATE SET
       username = EXCLUDED.username,
       city = EXCLUDED.city,
       has_vr_headset = EXCLUDED.has_vr_headset,
       vr_device_type = EXCLUDED.vr_device_type,
       skill_tier = EXCLUDED.skill_tier,
       rating_points = EXCLUDED.rating_points,
       latitude = EXCLUDED.latitude,
       longitude = EXCLUDED.longitude,
       updated_at = NOW()
     RETURNING id`,
    [
      email,
      passwordHash,
      username,
      'Pakistan',
      city,
      hasVr,
      vrDevice,
      skillTier,
      ratingPoints,
      coords.lat,
      coords.lng,
    ]
  );
  return result.rows[0].id as string;
}

async function upsertTournament(
  client: PoolClient,
  data: {
    name: string;
    game: string;
    format: string;
    startDate: Date;
    endDate: Date;
    status: string;
    maxPlayers: number;
    skillTier: number;
    buybackPriceCents: number;
    phase?: string;
    currentRoundNumber?: number;
  }
) {
  const existing = await client.query(`SELECT id FROM tournaments WHERE name = $1`, [data.name]);
  if (existing.rows[0]) {
    await client.query(
      `UPDATE tournaments SET
         game = $2, format = $3, start_date = $4, end_date = $5, status = $6,
         max_players = $7, skill_tier = $8, buyback_price_cents = $9,
         phase = $10, current_round_number = $11
       WHERE id = $1`,
      [
        existing.rows[0].id,
        data.game,
        data.format,
        data.startDate.toISOString(),
        data.endDate.toISOString(),
        data.status,
        data.maxPlayers,
        data.skillTier,
        data.buybackPriceCents,
        data.phase ?? 'normal',
        data.currentRoundNumber ?? 1,
      ]
    );
    return existing.rows[0].id as string;
  }

  const result = await client.query(
    `INSERT INTO tournaments (name, game, format, start_date, end_date, status, max_players, skill_tier, buyback_price_cents, phase, current_round_number)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      data.name,
      data.game,
      data.format,
      data.startDate.toISOString(),
      data.endDate.toISOString(),
      data.status,
      data.maxPlayers,
      data.skillTier,
      data.buybackPriceCents,
      data.phase ?? 'normal',
      data.currentRoundNumber ?? 1,
    ]
  );
  return result.rows[0].id as string;
}

async function upsertRound(
  client: PoolClient,
  tournamentId: string,
  roundNumber: number,
  startsAt: Date,
  endsAt: Date,
  status: 'active' | 'closed' = 'active'
) {
  await client.query(
    `INSERT INTO tournament_rounds (tournament_id, round_number, starts_at, ends_at, status)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (tournament_id, round_number) DO UPDATE SET
       starts_at = EXCLUDED.starts_at,
       ends_at = EXCLUDED.ends_at,
       status = EXCLUDED.status`,
    [tournamentId, roundNumber, startsAt.toISOString(), endsAt.toISOString(), status]
  );
}

async function registerParticipant(
  client: PoolClient,
  tournamentId: string,
  userId: string,
  opts: {
    status?: string;
    wins?: number;
    losses?: number;
    roundNumber?: number;
    buybackCount?: number;
    bookingId?: string | null;
  } = {}
) {
  await client.query(
    `INSERT INTO tournament_registrations (tournament_id, user_id, booking_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (tournament_id, user_id) DO UPDATE SET
       booking_id = COALESCE(EXCLUDED.booking_id, tournament_registrations.booking_id)`,
    [tournamentId, userId, opts.bookingId ?? null]
  );
  await client.query(
    `INSERT INTO tournament_participants (tournament_id, user_id, status, wins, losses, buyback_count, round_number)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (tournament_id, user_id) DO UPDATE SET
       status = EXCLUDED.status,
       wins = EXCLUDED.wins,
       losses = EXCLUDED.losses,
       buyback_count = EXCLUDED.buyback_count,
       round_number = EXCLUDED.round_number,
       updated_at = NOW()`,
    [
      tournamentId,
      userId,
      opts.status ?? 'active',
      opts.wins ?? 0,
      opts.losses ?? 0,
      opts.buybackCount ?? 0,
      opts.roundNumber ?? 1,
    ]
  );
}

async function syncParticipantStatsFromMatches(
  client: PoolClient,
  tournamentId: string,
  playerIds: string[]
) {
  for (const userId of playerIds) {
    const stats = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE (m.result->>'winnerId')::uuid = $2)::int AS wins,
         COUNT(*) FILTER (
           WHERE m.status = 'completed'
             AND (m.result->>'winnerId')::uuid IS NOT NULL
             AND (m.result->>'winnerId')::uuid != $2
             AND ($2 = m.player1_id OR $2 = m.player2_id)
         )::int AS losses
       FROM matches m
       WHERE m.tournament_id = $1
         AND ($2 = m.player1_id OR $2 = m.player2_id)
         AND m.phase = 'normal'`,
      [tournamentId, userId]
    );

    const wins = stats.rows[0]?.wins ?? 0;
    const losses = stats.rows[0]?.losses ?? 0;

    const activeMatch = await client.query(
      `SELECT id FROM matches
       WHERE tournament_id = $1
         AND ($2 = player1_id OR $2 = player2_id)
         AND status IN ('pending_confirmation', 'confirmed', 'in_progress')
       LIMIT 1`,
      [tournamentId, userId]
    );

    const roundResult = await client.query(
      `SELECT COALESCE(MAX(round_number), 1)::int AS round_number
       FROM matches
       WHERE tournament_id = $1
         AND ($2 = player1_id OR $2 = player2_id)`,
      [tournamentId, userId]
    );
    const roundNumber = roundResult.rows[0]?.round_number ?? 1;

    const lastCompleted = await client.query(
      `SELECT (m.result->>'winnerId')::uuid AS winner_id
       FROM matches m
       WHERE m.tournament_id = $1
         AND ($2 = m.player1_id OR $2 = m.player2_id)
         AND m.status = 'completed'
         AND m.phase = 'normal'
       ORDER BY m.updated_at DESC
       LIMIT 1`,
      [tournamentId, userId]
    );

    let status = 'active';
    const lastWinnerId = lastCompleted.rows[0]?.winner_id;
    if (lastWinnerId && lastWinnerId !== userId && !activeMatch.rows[0]) {
      status = 'eliminated';
    }

    await client.query(
      `UPDATE tournament_participants
       SET wins = $3, losses = $4, round_number = $5, status = $6, updated_at = NOW()
       WHERE tournament_id = $1 AND user_id = $2`,
      [tournamentId, userId, wins, losses, roundNumber, status]
    );
  }
}

async function insertMatch(client: PoolClient, m: MatchSeed) {
  const result = await client.query(
    `INSERT INTO matches (tournament_id, player1_id, player2_id, venue_id, time_slot_id, status, result, scheduled_at, round_number, phase, bracket_slot)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      m.tournamentId ?? null,
      m.player1Id,
      m.player2Id,
      m.venueId ?? null,
      m.timeSlotId ?? null,
      m.status,
      m.result ? JSON.stringify(m.result) : null,
      m.scheduledAt?.toISOString() ?? null,
      m.roundNumber ?? null,
      m.phase ?? 'normal',
      m.bracketSlot ?? null,
    ]
  );
  return result.rows[0].id as string;
}

function completedResult(p1: string, p2: string, p1Score: number, p2Score: number) {
  return {
    player1Score: p1Score,
    player2Score: p2Score,
    winnerId: p1Score >= p2Score ? p1 : p2,
  };
}

function inProgressResult(p1Score: number, p2Score: number) {
  return { player1Score: p1Score, player2Score: p2Score, winnerId: null };
}

/** Seeds RO16 → QF → SF (+ optional Final) for a 16-player knockout bracket demo. */
async function seedKnockoutBracket(
  client: PoolClient,
  tournamentId: string,
  koPlayers: string[],
  scheduledAt?: Date
) {
  const players = koPlayers.slice(0, 16);
  if (players.length < 16) {
    console.warn(`Knockout bracket needs 16 players; got ${players.length}`);
    return;
  }

  const ro16Winners: string[] = [];
  for (let slot = 0; slot < 8; slot++) {
    const p1 = players[slot * 2];
    const p2 = players[slot * 2 + 1];
    const winner = slot % 2 === 0 ? p1 : p2;
    ro16Winners.push(winner);
    await insertMatch(client, {
      tournamentId,
      player1Id: p1,
      player2Id: p2,
      status: 'completed',
      roundNumber: KNOCKOUT.ro16,
      phase: 'knockout',
      bracketSlot: slot,
      result: completedResult(p1, p2, 20 + slot, 15 + slot),
    });
  }

  const qfWinners: string[] = [];
  for (let slot = 0; slot < 4; slot++) {
    const p1 = ro16Winners[slot * 2];
    const p2 = ro16Winners[slot * 2 + 1];
    const completed = slot < 2;
    const winner = completed ? p1 : null;
    if (winner) qfWinners.push(winner);
    await insertMatch(client, {
      tournamentId,
      player1Id: p1,
      player2Id: p2,
      status: completed ? 'completed' : 'in_progress',
      roundNumber: KNOCKOUT.qf,
      phase: 'knockout',
      bracketSlot: slot,
      result: completed ? completedResult(p1, p2, 24, 20) : inProgressResult(10, 8),
    });
  }

  await insertMatch(client, {
    tournamentId,
    player1Id: ro16Winners[0],
    player2Id: ro16Winners[2],
    status: 'confirmed',
    roundNumber: KNOCKOUT.sf,
    phase: 'knockout',
    bracketSlot: 0,
    scheduledAt,
  });
  await insertMatch(client, {
    tournamentId,
    player1Id: ro16Winners[4],
    player2Id: ro16Winners[6],
    status: 'pending_confirmation',
    roundNumber: KNOCKOUT.sf,
    phase: 'knockout',
    bracketSlot: 1,
    scheduledAt,
  });

  await insertMatch(client, {
    tournamentId,
    player1Id: ro16Winners[0],
    player2Id: ro16Winners[4],
    status: 'pending_confirmation',
    roundNumber: KNOCKOUT.final,
    phase: 'knockout',
    bracketSlot: 0,
    scheduledAt,
  });
}

async function seedMatchmakingQueue(opts: {
  tournamentId: string;
  userId: string;
  skillTier: number;
  hasVr: boolean;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  roundNumber: number;
  preferredVenueId?: string | null;
  bookingId?: string | null;
}) {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.log('REDIS_URL not set — skipping matchmaking queue seed');
    return;
  }

  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
  try {
    await redis.ping();
    const queueKey = queueTournamentKey(opts.tournamentId);
    const joinedAt = Date.now();
    const hash = buildQueuePlayerHash({
      userId: opts.userId,
      skillTier: opts.skillTier,
      hasVr: opts.hasVr,
      city: opts.city,
      country: opts.country,
      latitude: opts.latitude,
      longitude: opts.longitude,
      joinedAt,
      tournamentId: opts.tournamentId,
      preferredVenueId: opts.preferredVenueId ?? null,
      roundNumber: opts.roundNumber,
      bookingId: opts.bookingId ?? null,
    });

    await redis.del(queueKey, queuePlayerKey(opts.userId));
    await redis.srem(QUEUE_MEMBER, opts.userId);
    const multi = redis.multi();
    multi.zadd(queueKey, joinedAt, opts.userId);
    multi.sadd(QUEUE_MEMBER, opts.userId);
    multi.hset(queuePlayerKey(opts.userId), hash);
    multi.sadd(QUEUE_TOURNAMENT_INDEX, opts.tournamentId);
    await multi.exec();
    console.log('Seeded matchmaking queue for player5 in Karachi Open VR');
  } catch (err) {
    console.warn('Could not seed Redis queue (is Redis running?):', (err as Error).message);
  } finally {
    await redis.quit();
  }
}

function printSeedGuide(tournamentIds: {
  lahoreCupId: string;
  karachiOpenId: string;
  knockoutCupId: string;
  islamabadLeagueId: string;
}) {
  const pw = 'password123';
  console.log('\n=== Test accounts (password: password123) ===');
  console.log('  admin@vrtournament.com     superadmin');
  console.log('  player@vrtournament.com    non-VR Lahore — in Lahore Cup R2, bookings, matches');
  console.log('  player2@vrtournament.com   VR Lahore — in Lahore Cup, use "Find my match" flow');
  console.log('  player3@vrtournament.com   non-VR Karachi — in Karachi Open');
  console.log('  player4@vrtournament.com   NOT in any tournament — test enter/register flow');
  console.log('  player5@vrtournament.com   VR Karachi — in queue ("Finding opponent…")');
  console.log('\n=== Feature checklist ===');
  console.log('  Tournaments hub (/)          → /tournaments — 5 tournaments (open, in-progress, knockout, completed)');
  console.log('  Guest view                   → log out, browse tournaments');
  console.log('  Non-VR enter flow            → login player1 → Islamabad VR League → /play → venue → slot → confirm');
  console.log('  VR enter flow                → login player2 → any open tournament → "Find my match"');
  console.log('  Fresh registration           → login player4 → join Islamabad VR League');
  console.log('  Finding opponent             → login player5 → /tournaments shows queue state');
  console.log('  Match states                 → player1 → /matches (pending, confirmed, in-progress, completed, cancelled)');
  console.log('  Bookings                     → player1 → /bookings');
  console.log('  Profile tier + points        → /profile (private view)');
  console.log('  Venues geo search            → home page uses Lahore/Karachi coords');
  console.log('  Buyback                      → login imam_lefty / password123 → /matches');
  console.log('  Knockout bracket             → Lahore VR Championship → Knockout tab (also Punjab Knockout Cup)');
  console.log('  Notifications                → bell icon for player1/player2/player3');
  console.log('\nTournament IDs (for API/debug):');
  console.log('  Lahore VR Championship:', tournamentIds.lahoreCupId);
  console.log('  Karachi Open VR:', tournamentIds.karachiOpenId);
  console.log('  Punjab Knockout Cup:', tournamentIds.knockoutCupId);
  console.log('  Islamabad VR League:', tournamentIds.islamabadLeagueId);
}

async function clearTournamentMatches(client: PoolClient, tournamentId: string) {
  await client.query(`DELETE FROM buybacks WHERE tournament_id = $1`, [tournamentId]);
  await client.query(`DELETE FROM matches WHERE tournament_id = $1`, [tournamentId]);
}

async function clearCasualMatchesForUsers(client: PoolClient, userIds: string[]) {
  await client.query(
    `DELETE FROM matches
     WHERE tournament_id IS NULL
       AND (player1_id = ANY($1::uuid[]) OR player2_id = ANY($1::uuid[]))`,
    [userIds]
  );
}

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const passwordHash = await bcrypt.hash('password123', 12);

    const adminId = await upsertUser(
      client,
      passwordHash,
      'admin@vrtournament.com',
      'admin',
      'Lahore',
      true,
      1800,
      'Meta Quest 3'
    );
    await client.query(`UPDATE users SET role = 'superadmin' WHERE id = $1`, [adminId]);

    const playerIds: string[] = [];
    playerIds.push(
      await upsertUser(client, passwordHash, 'player@vrtournament.com', 'player1', 'Lahore', false, 650)
    );
    playerIds.push(
      await upsertUser(
        client,
        passwordHash,
        'player2@vrtournament.com',
        'player2_vr',
        'Lahore',
        true,
        820,
        'Meta Quest 3'
      )
    );
    playerIds.push(
      await upsertUser(client, passwordHash, 'player3@vrtournament.com', 'player3_khi', 'Karachi', false, 1250)
    );
    // Fresh account — not registered in any tournament (use for enter / register flow)
    playerIds.push(
      await upsertUser(client, passwordHash, 'player4@vrtournament.com', 'player4_fresh', 'Lahore', false, 650)
    );
    // Queued account — registered + waiting for opponent
    playerIds.push(
      await upsertUser(
        client,
        passwordHash,
        'player5@vrtournament.com',
        'player5_queued',
        'Karachi',
        true,
        780,
        'Pico 4'
      )
    );

    const cities = ['Lahore', 'Lahore', 'Karachi', 'Karachi', 'Islamabad'];
    const ratingSpread = [420, 550, 680, 920, 1100, 1350, 1550, 1750, 2000, 300, 480, 720, 880, 1050, 1420, 1680, 1900, 510, 760, 990];
    for (let i = 0; i < EXTRA_PLAYER_NAMES.length; i++) {
      const username = EXTRA_PLAYER_NAMES[i];
      const city = cities[i % cities.length];
      const hasVr = i % 3 !== 0;
      const ratingPoints = ratingSpread[i % ratingSpread.length];
      playerIds.push(
        await upsertUser(
          client,
          passwordHash,
          `player${i + 6}@vrtournament.com`,
          username,
          city,
          hasVr,
          ratingPoints,
          hasVr ? (i % 2 === 0 ? 'Meta Quest 3' : 'Pico 4') : null
        )
      );
    }

    console.log(`Seeded ${playerIds.length} players (password: password123)`);

    const venueIds: string[] = [];
    const venueSlots = new Map<string, { id: string; start: string; end: string }[]>();

    for (const venue of venues) {
      const existing = await client.query('SELECT id FROM venues WHERE name = $1 AND city = $2', [
        venue.name,
        venue.city,
      ]);

      let venueId: string;
      if (existing.rows.length > 0) {
        venueId = existing.rows[0].id;
      } else {
        const venueResult = await client.query(
          `INSERT INTO venues (name, address, city, country, location, capacity)
           VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326), $7)
           RETURNING id`,
          [venue.name, venue.address, venue.city, venue.country, venue.lng, venue.lat, venue.capacity]
        );
        venueId = venueResult.rows[0].id;
      }
      venueIds.push(venueId);

      const now = new Date();
      const slots: { id: string; start: string; end: string }[] = [];

      // Drop stale slots so re-seeds always have bookable times ahead
      await client.query(
        `DELETE FROM time_slots ts
         WHERE ts.venue_id = $1
           AND ts.start_time < NOW() - INTERVAL '1 day'
           AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.time_slot_id = ts.id)`,
        [venueId]
      );

      for (let day = 0; day < 7; day++) {
        for (let hour = 10; hour < 20; hour++) {
          const start = new Date(now);
          start.setDate(start.getDate() + day);
          start.setHours(hour, 0, 0, 0);

          const end = new Date(start);
          end.setHours(hour + 1, 0, 0, 0);

          const slotResult = await client.query(
            `INSERT INTO time_slots (venue_id, start_time, end_time, max_capacity)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (venue_id, start_time) DO UPDATE SET max_capacity = EXCLUDED.max_capacity
             RETURNING id, start_time, end_time`,
            [venueId, start.toISOString(), end.toISOString(), venue.capacity]
          );
          slots.push({
            id: slotResult.rows[0].id,
            start: slotResult.rows[0].start_time,
            end: slotResult.rows[0].end_time,
          });
        }
      }
      venueSlots.set(venueId, slots);
    }

    const lahoreVenueId = venueIds[0];
    const karachiVenueId = venueIds[3];
    const lahoreSlots = venueSlots.get(lahoreVenueId) ?? [];
    const karachiSlots = venueSlots.get(karachiVenueId) ?? [];

    const now = new Date();
    const inDays = (n: number) => {
      const d = new Date(now);
      d.setDate(d.getDate() + n);
      return d;
    };

    // --- Tournament 1: Lahore VR Championship (normal phase, round 2) ---
    const lahoreCupId = await upsertTournament(client, {
      name: 'Lahore VR Championship',
      game: 'VR Cricket',
      format: 'single_elimination',
      startDate: inDays(7),
      endDate: inDays(10),
      status: 'in_progress',
      maxPlayers: 64,
      skillTier: 3,
      buybackPriceCents: 500,
      phase: 'normal',
      currentRoundNumber: 2,
    });

    await upsertRound(client, lahoreCupId, 1, inDays(-3), inDays(-1), 'closed');
    await upsertRound(client, lahoreCupId, 2, inDays(0), inDays(2), 'active');

    const lahorePlayers = [playerIds[0], playerIds[1], ...playerIds.slice(6, 14)];
    for (let i = 0; i < lahorePlayers.length; i++) {
      await registerParticipant(client, lahoreCupId, lahorePlayers[i]);
    }

    await clearTournamentMatches(client, lahoreCupId);

    const round1Pairs = [
      [0, 1],
      [2, 3],
      [4, 5],
      [6, 7],
    ] as const;
    for (let i = 0; i < round1Pairs.length; i++) {
      const [a, b] = round1Pairs[i];
      const p1 = lahorePlayers[a];
      const p2 = lahorePlayers[b];
      const p1Score = 18 + (i % 5);
      const p2Score = 12 + (i % 4);
      await insertMatch(client, {
        tournamentId: lahoreCupId,
        player1Id: p1,
        player2Id: p2,
        status: 'completed',
        roundNumber: 1,
        phase: 'normal',
        result: completedResult(p1, p2, p1Score, p2Score),
      });
    }

    const round2Statuses: MatchSeed['status'][] = ['completed', 'completed', 'in_progress', 'pending_confirmation'];
    for (let i = 0; i < 4; i++) {
      const p1 = lahorePlayers[i * 2];
      const p2 = lahorePlayers[i * 2 + 1];
      const status = round2Statuses[i];
      const slot = lahoreSlots[i + 10];
      await insertMatch(client, {
        tournamentId: lahoreCupId,
        player1Id: p1,
        player2Id: p2,
        venueId: lahoreVenueId,
        timeSlotId: slot?.id,
        status,
        roundNumber: 2,
        phase: 'normal',
        scheduledAt: slot ? new Date(slot.start) : inDays(1),
        result:
          status === 'completed'
            ? completedResult(p1, p2, 22, 19)
            : status === 'in_progress'
              ? { player1Score: 8, player2Score: 6, winnerId: p1 }
              : null,
      });
    }

    await syncParticipantStatsFromMatches(client, lahoreCupId, lahorePlayers);

    // Knockout phase — normal rounds 1–2 stay visible; Knockout tab shows bracket
    const koQualifiers = playerIds.slice(0, 16);
    for (const pid of koQualifiers) {
      if (!lahorePlayers.includes(pid)) {
        await registerParticipant(client, lahoreCupId, pid);
      }
      await client.query(
        `UPDATE tournament_participants
         SET status = 'knockout', round_number = $3, wins = GREATEST(wins, 2), updated_at = NOW()
         WHERE tournament_id = $1 AND user_id = $2`,
        [lahoreCupId, pid, KNOCKOUT.qf]
      );
    }
    await client.query(
      `UPDATE tournament_participants SET status = 'eliminated', updated_at = NOW()
       WHERE tournament_id = $1 AND user_id != ALL($2::uuid[])`,
      [lahoreCupId, koQualifiers]
    );
    await client.query(
      `UPDATE tournaments SET phase = 'knockout', current_round_number = $2 WHERE id = $1`,
      [lahoreCupId, KNOCKOUT.qf]
    );
    await client.query(
      `UPDATE tournament_rounds SET status = 'closed' WHERE tournament_id = $1`,
      [lahoreCupId]
    );
    await seedKnockoutBracket(client, lahoreCupId, koQualifiers, inDays(2));

    // --- Tournament 2: Karachi Open VR (open, round 1) ---
    const karachiOpenId = await upsertTournament(client, {
      name: 'Karachi Open VR',
      game: 'VR Cricket',
      format: 'single_elimination',
      startDate: inDays(14),
      endDate: inDays(16),
      status: 'open',
      maxPlayers: 64,
      skillTier: 3,
      buybackPriceCents: 500,
      phase: 'normal',
      currentRoundNumber: 1,
    });

    await upsertRound(client, karachiOpenId, 1, inDays(13), inDays(15), 'active');

    const karachiPlayers = [playerIds[2], playerIds[4], ...playerIds.slice(14, 20)];
    for (const pid of karachiPlayers) {
      await registerParticipant(client, karachiOpenId, pid);
    }

    await clearTournamentMatches(client, karachiOpenId);

    const karachiStatuses: MatchSeed['status'][] = [
      'completed',
      'confirmed',
      'pending_confirmation',
      'cancelled',
    ];
    for (let i = 0; i < Math.min(4, Math.floor(karachiPlayers.length / 2)); i++) {
      const p1 = karachiPlayers[i * 2];
      const p2 = karachiPlayers[i * 2 + 1];
      const slot = karachiSlots[i + 5];
      await insertMatch(client, {
        tournamentId: karachiOpenId,
        player1Id: p1,
        player2Id: p2,
        venueId: karachiVenueId,
        timeSlotId: slot?.id,
        status: karachiStatuses[i],
        roundNumber: 1,
        phase: 'normal',
        scheduledAt: slot ? new Date(slot.start) : inDays(14),
        result:
          karachiStatuses[i] === 'completed' ? completedResult(p1, p2, 25, 21) : null,
      });
    }

    // --- Tournament 3: Punjab Knockout Cup (knockout phase in progress) ---
    const knockoutCupId = await upsertTournament(client, {
      name: 'Punjab Knockout Cup',
      game: 'VR Cricket',
      format: 'single_elimination',
      startDate: inDays(-7),
      endDate: inDays(3),
      status: 'in_progress',
      maxPlayers: 64,
      skillTier: 4,
      buybackPriceCents: 750,
      phase: 'knockout',
      currentRoundNumber: KNOCKOUT.qf,
    });

    const koPlayers = playerIds.slice(0, 16);
    for (const pid of koPlayers) {
      await registerParticipant(client, knockoutCupId, pid, {
        status: 'knockout',
        roundNumber: KNOCKOUT.qf,
        wins: 2,
        losses: 0,
      });
    }

    await clearTournamentMatches(client, knockoutCupId);
    await seedKnockoutBracket(client, knockoutCupId, koPlayers, inDays(1));

    // --- Tournament 4: Winter VR Cup (completed) ---
    const winterCupId = await upsertTournament(client, {
      name: 'Winter VR Cup 2025',
      game: 'VR Cricket',
      format: 'single_elimination',
      startDate: inDays(-30),
      endDate: inDays(-20),
      status: 'completed',
      maxPlayers: 32,
      skillTier: 3,
      buybackPriceCents: 500,
      phase: 'completed',
      currentRoundNumber: KNOCKOUT.final,
    });

    const winterPlayers = playerIds.slice(4, 12);
    for (const pid of winterPlayers) {
      await registerParticipant(client, winterCupId, pid, { status: 'out', wins: 1, losses: 1 });
    }
    await client.query(
      `UPDATE tournament_participants SET status = 'advanced', wins = 4, losses = 0
       WHERE tournament_id = $1 AND user_id = $2`,
      [winterCupId, winterPlayers[0]]
    );

    await clearTournamentMatches(client, winterCupId);

    const finalP1 = winterPlayers[0];
    const finalP2 = winterPlayers[1];
    await insertMatch(client, {
      tournamentId: winterCupId,
      player1Id: finalP1,
      player2Id: finalP2,
      status: 'completed',
      roundNumber: KNOCKOUT.final,
      phase: 'knockout',
      bracketSlot: 0,
      result: completedResult(finalP1, finalP2, 28, 24),
    });

    // --- Tournament 5: Islamabad VR League (open, no registrations — fresh enter flow) ---
    const islamabadLeagueId = await upsertTournament(client, {
      name: 'Islamabad VR League',
      game: 'VR Cricket',
      format: 'single_elimination',
      startDate: inDays(21),
      endDate: inDays(24),
      status: 'open',
      maxPlayers: 32,
      skillTier: 2,
      buybackPriceCents: 500,
      phase: 'normal',
      currentRoundNumber: 1,
    });

    await upsertRound(client, islamabadLeagueId, 1, inDays(20), inDays(23), 'active');

    // --- Casual matchmaking matches for test accounts ---
    const testUserIds = playerIds.slice(0, 3);
    await clearCasualMatchesForUsers(client, testUserIds);

    const casualConfigs: Array<{ status: MatchSeed['status']; daysFromNow: number; withVenue: boolean }> = [
      { status: 'pending_confirmation', daysFromNow: 1, withVenue: true },
      { status: 'confirmed', daysFromNow: 2, withVenue: true },
      { status: 'in_progress', daysFromNow: 0, withVenue: true },
      { status: 'completed', daysFromNow: -2, withVenue: true },
      { status: 'cancelled', daysFromNow: -1, withVenue: false },
      { status: 'expired', daysFromNow: -3, withVenue: false },
    ];

    for (let i = 0; i < casualConfigs.length; i++) {
      const cfg = casualConfigs[i];
      const p1 = testUserIds[i % 3];
      const p2 = testUserIds[(i + 1) % 3];
      const slot = lahoreSlots[i + 2];
      await insertMatch(client, {
        player1Id: p1,
        player2Id: p2,
        venueId: cfg.withVenue ? lahoreVenueId : null,
        timeSlotId: cfg.withVenue ? slot?.id : null,
        status: cfg.status,
        scheduledAt: inDays(cfg.daysFromNow),
        result:
          cfg.status === 'completed'
            ? completedResult(p1, p2, 21, 17)
            : cfg.status === 'in_progress'
              ? { player1Score: 5, player2Score: 4, winnerId: p1 }
              : null,
      });
    }

    // --- Bookings ---
    const bookingIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const userId = playerIds[i];
      const slot = lahoreSlots[i + 15];
      if (!slot) continue;

      const bookingResult = await client.query(
        `INSERT INTO bookings (user_id, time_slot_id, status)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, time_slot_id) DO UPDATE SET status = EXCLUDED.status
         RETURNING id`,
        [userId, slot.id, i % 2 === 0 ? 'confirmed' : 'pending']
      );
      bookingIds.push(bookingResult.rows[0].id);
    }

    if (bookingIds[0]) {
      await client.query(
        `UPDATE tournament_registrations SET booking_id = $1
         WHERE tournament_id = $2 AND user_id = $3`,
        [bookingIds[0], lahoreCupId, playerIds[0]]
      );
    }

    // --- Notifications ---
    await client.query(
      `DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`,
      [testUserIds]
    );

    const notificationSeeds = [
      { userId: testUserIds[0], type: 'match_found', payload: { matchId: 'demo', opponent: 'player2_vr' } },
      { userId: testUserIds[0], type: 'match_confirmed', payload: { venue: 'VR Arena Lahore' } },
      { userId: testUserIds[0], type: 'tournament_round_closed', payload: { tournament: 'Lahore VR Championship', round: 1 } },
      { userId: testUserIds[1], type: 'match_found', payload: { opponent: 'player1' }, read: true },
      { userId: testUserIds[1], type: 'queue_joined', payload: { position: 3 } },
      { userId: testUserIds[2], type: 'booking_confirmed', payload: { venue: 'Karachi VR Center' } },
    ];

    for (const n of notificationSeeds) {
      await client.query(
        `INSERT INTO notifications (user_id, type, channel, payload, read, status, sent_at, idempotency_key)
         VALUES ($1, $2, 'in_app', $3, $4, 'sent', NOW(), $5)
         ON CONFLICT (user_id, idempotency_key) DO UPDATE SET
           payload = EXCLUDED.payload,
           read = EXCLUDED.read`,
        [n.userId, n.type, JSON.stringify(n.payload), (n as { read?: boolean }).read ?? false, `seed-${n.type}-${n.userId}`]
      );
    }

    // --- Buyback demo: imam_lefty eliminated in Lahore Cup (buyback not yet used) ---
    const imamRow = await client.query(`SELECT id FROM users WHERE username = 'imam_lefty' LIMIT 1`);
    const buybackDemoPlayer = imamRow.rows[0]?.id;
    if (buybackDemoPlayer) {
      await client.query(`DELETE FROM buybacks WHERE tournament_id = $1 AND user_id = $2`, [
        lahoreCupId,
        buybackDemoPlayer,
      ]);
      await client.query(
        `UPDATE tournament_participants SET status = 'eliminated', losses = GREATEST(losses, 1)
         WHERE tournament_id = $1 AND user_id = $2`,
        [lahoreCupId, buybackDemoPlayer]
      );
    }

    await client.query('COMMIT');

    await seedMatchmakingQueue({
      tournamentId: karachiOpenId,
      userId: playerIds[4],
      skillTier: pointsToTier(780),
      hasVr: true,
      city: 'Karachi',
      country: 'Pakistan',
      latitude: CITY_COORDS.Karachi.lat,
      longitude: CITY_COORDS.Karachi.lng,
      roundNumber: 1,
    });

    const summary = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM users WHERE role = 'player') AS players,
        (SELECT COUNT(*)::int FROM tournaments) AS tournaments,
        (SELECT COUNT(*)::int FROM matches) AS matches,
        (SELECT COUNT(*)::int FROM tournament_participants) AS participants,
        (SELECT COUNT(*)::int FROM bookings) AS bookings,
        (SELECT COUNT(*)::int FROM notifications) AS notifications
    `);

    console.log('Seed completed successfully');
    console.log('Counts:', summary.rows[0]);
    printSeedGuide({
      lahoreCupId,
      karachiOpenId,
      knockoutCupId,
      islamabadLeagueId,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
