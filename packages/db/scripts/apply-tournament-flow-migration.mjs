import dotenv from 'dotenv';
import pg from 'pg';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env'), override: true });

const sql = readFileSync(
  resolve(__dirname, '../migrations/1738000000011_tournament-flow.sql'),
  'utf8'
);

const upSection = sql.split('-- migrate:down')[0].trim();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query(upSection);
  console.log('Tournament flow migration applied successfully');
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exit(1);
} finally {
  await pool.end();
}
