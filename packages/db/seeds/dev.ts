import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'), override: true });
import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const passwordHash = await bcrypt.hash('password123', 12);

    const adminResult = await client.query(
      `INSERT INTO users (email, password_hash, username, country, city, has_vr_headset, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (email) DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      ['admin@vrtournament.com', passwordHash, 'admin', 'Pakistan', 'Lahore', true, 'superadmin']
    );

    const playerResult = await client.query(
      `INSERT INTO users (email, password_hash, username, country, city, has_vr_headset, vr_device_type, skill_tier)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (email) DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      ['player@vrtournament.com', passwordHash, 'player1', 'Pakistan', 'Lahore', false, null, 3]
    );

    const player2Result = await client.query(
      `INSERT INTO users (email, password_hash, username, country, city, has_vr_headset, vr_device_type, skill_tier)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (email) DO UPDATE SET
         has_vr_headset = EXCLUDED.has_vr_headset,
         vr_device_type = EXCLUDED.vr_device_type,
         skill_tier = EXCLUDED.skill_tier,
         updated_at = NOW()
       RETURNING id`,
      ['player2@vrtournament.com', passwordHash, 'player2_vr', 'Pakistan', 'Lahore', true, 'Meta Quest 3', 3]
    );

    const player3Result = await client.query(
      `INSERT INTO users (email, password_hash, username, country, city, has_vr_headset, vr_device_type, skill_tier)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (email) DO UPDATE SET
         city = EXCLUDED.city,
         skill_tier = EXCLUDED.skill_tier,
         updated_at = NOW()
       RETURNING id`,
      ['player3@vrtournament.com', passwordHash, 'player3_khi', 'Pakistan', 'Karachi', false, null, 4]
    );

    console.log('Seeded users:', {
      admin: adminResult.rows[0]?.id,
      player: playerResult.rows[0]?.id,
      player2: player2Result.rows[0]?.id,
      player3: player3Result.rows[0]?.id,
    });

    for (const venue of venues) {
      const existing = await client.query(
        'SELECT id FROM venues WHERE name = $1 AND city = $2',
        [venue.name, venue.city]
      );

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
      const now = new Date();

      for (let day = 0; day < 7; day++) {
        for (let hour = 10; hour < 20; hour++) {
          const start = new Date(now);
          start.setDate(start.getDate() + day);
          start.setHours(hour, 0, 0, 0);

          const end = new Date(start);
          end.setHours(hour + 1, 0, 0, 0);

          await client.query(
            `INSERT INTO time_slots (venue_id, start_time, end_time, max_capacity)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (venue_id, start_time) DO NOTHING`,
            [venueId, start.toISOString(), end.toISOString(), venue.capacity]
          );
        }
      }
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 7);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 3);

    let tournamentId: string | undefined;
    const existingTournament = await client.query(
      `SELECT id FROM tournaments WHERE name = $1`,
      ['Lahore VR Championship']
    );
    if (existingTournament.rows[0]) {
      tournamentId = existingTournament.rows[0].id;
      await client.query(
        `UPDATE tournaments SET skill_tier = 3, buyback_price_cents = 500, phase = 'normal', current_round_number = 1
         WHERE id = $1`,
        [tournamentId]
      );
    } else {
      const tournamentResult = await client.query(
        `INSERT INTO tournaments (name, game, format, start_date, end_date, status, max_players, skill_tier, buyback_price_cents)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          'Lahore VR Championship',
          'VR Cricket',
          'single_elimination',
          startDate.toISOString(),
          endDate.toISOString(),
          'open',
          64,
          3,
          500,
        ]
      );
      tournamentId = tournamentResult.rows[0]?.id;
    }

    if (tournamentId) {
      const roundStart = new Date();
      const roundEnd = new Date(roundStart);
      roundEnd.setDate(roundEnd.getDate() + 3);
      await client.query(
        `INSERT INTO tournament_rounds (tournament_id, round_number, starts_at, ends_at, status)
         VALUES ($1, 1, $2, $3, 'active')
         ON CONFLICT (tournament_id, round_number) DO NOTHING`,
        [tournamentId, roundStart.toISOString(), roundEnd.toISOString()]
      );
    }

    for (const pid of [playerResult.rows[0]?.id, player2Result.rows[0]?.id, player3Result.rows[0]?.id]) {
      if (!tournamentId || !pid) continue;
      await client.query(
        `INSERT INTO tournament_registrations (tournament_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (tournament_id, user_id) DO NOTHING`,
        [tournamentId, pid]
      );
      await client.query(
        `INSERT INTO tournament_participants (tournament_id, user_id, status, round_number)
         VALUES ($1, $2, 'active', 1)
         ON CONFLICT (tournament_id, user_id) DO NOTHING`,
        [tournamentId, pid]
      );
    }

    const startDate2 = new Date();
    startDate2.setDate(startDate2.getDate() + 14);
    const endDate2 = new Date(startDate2);
    endDate2.setDate(endDate2.getDate() + 2);

    const existingKarachi = await client.query(
      `SELECT id FROM tournaments WHERE name = $1`,
      ['Karachi Open VR']
    );
    if (!existingKarachi.rows[0]) {
      const t2Start = startDate2;
      const t2End = endDate2;
      const t2Result = await client.query(
        `INSERT INTO tournaments (name, game, format, start_date, end_date, status, max_players, skill_tier, buyback_price_cents)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          'Karachi Open VR',
          'VR Cricket',
          'single_elimination',
          t2Start.toISOString(),
          t2End.toISOString(),
          'open',
          64,
          3,
          500,
        ]
      );
      const t2Id = t2Result.rows[0]?.id;
      if (t2Id) {
        const rs = new Date();
        const re = new Date(rs);
        re.setDate(re.getDate() + 3);
        await client.query(
          `INSERT INTO tournament_rounds (tournament_id, round_number, starts_at, ends_at, status)
           VALUES ($1, 1, $2, $3, 'active')`,
          [t2Id, rs.toISOString(), re.toISOString()]
        );
      }
    }

    await client.query('COMMIT');
    console.log('Seed completed successfully');
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
