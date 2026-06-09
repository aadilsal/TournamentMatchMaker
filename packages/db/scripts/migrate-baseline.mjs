import dotenv from 'dotenv';
import pg from 'pg';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env'), override: true });

const migrations = [
  '1738000000001_extensions-and-users',
  '1738000000002_venues',
  '1738000000003_time-slots-and-bookings',
];

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function baseline() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT EXISTS (
         SELECT FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'users'
       ) AS exists`
    );

    if (!rows[0]?.exists) {
      console.error('Schema not found. Run pnpm migrate:up instead of baseline.');
      process.exit(1);
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS pgmigrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        run_on TIMESTAMPTZ NOT NULL
      )
    `);

    for (const name of migrations) {
      const existing = await client.query(
        'SELECT 1 FROM pgmigrations WHERE name = $1',
        [name]
      );
      if (existing.rows.length === 0) {
        await client.query(
          'INSERT INTO pgmigrations (name, run_on) VALUES ($1, NOW())',
          [name]
        );
      }
    }

    console.log('Migration baseline recorded for existing schema');
  } finally {
    client.release();
    await pool.end();
  }
}

baseline().catch((err) => {
  console.error('Baseline failed:', err.message);
  process.exit(1);
});
