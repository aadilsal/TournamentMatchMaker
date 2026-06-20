import pg from 'pg';
import { Redis } from 'ioredis';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL);

const recent = await pool.query(`
  SELECT m.id, m.status, u1.username AS p1, u2.username AS p2, m.created_at, t.name AS tournament
  FROM matches m
  JOIN users u1 ON u1.id = m.player1_id
  JOIN users u2 ON u2.id = m.player2_id
  LEFT JOIN tournaments t ON t.id = m.tournament_id
  WHERE m.status IN ('pending_confirmation', 'confirmed')
  ORDER BY m.created_at DESC
  LIMIT 8
`);
console.log('Recent active matches:');
console.table(recent.rows);

const members = await redis.zrange('queue:global', 0, -1, 'WITHSCORES');
console.log('\nGlobal queue (queue:global):', members.length ? members : '(empty)');

await redis.quit();
await pool.end();
