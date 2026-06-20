import pg from 'pg';
import { Redis } from 'ioredis';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../.env') });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL);

const r = await pool.query(`
  SELECT m.status, u1.username AS p1, u2.username AS p2, t.name AS trn, m.created_at
  FROM matches m
  JOIN users u1 ON u1.id = m.player1_id
  JOIN users u2 ON u2.id = m.player2_id
  LEFT JOIN tournaments t ON t.id = m.tournament_id
  WHERE m.status = 'pending_confirmation'
  ORDER BY m.created_at DESC
  LIMIT 5
`);
console.log('Pending matches:', r.rows);
console.log('Global queue:', await redis.zrange('queue:global', 0, -1));

await pool.end();
redis.quit();
