import dotenv from 'dotenv';
import pg from 'pg';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { baselineExistingSchema } from './migration-baseline.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env'), override: true });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  const client = await pool.connect();
  try {
    const { baselined } = await baselineExistingSchema(client);
    if (baselined === 0) {
      console.log('No unrecorded migrations found (schema may be empty or already baselined)');
    } else {
      console.log(`Migration baseline recorded for ${baselined} migration(s)`);
    }
  } finally {
    client.release();
  }
} catch (err) {
  console.error('Baseline failed:', err.message);
  process.exit(1);
} finally {
  await pool.end();
}
