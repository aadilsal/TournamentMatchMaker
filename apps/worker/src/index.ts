import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });

import pg from 'pg';
import { Redis } from 'ioredis';
import { Queue, Worker } from 'bullmq';
import { loadEnv } from './config/env.js';
import { processPairPlayersJob } from './jobs/pair-players.job.js';
import { processExpireMatchesJob } from './jobs/expire-matches.job.js';
import { processDispatchNotificationJob } from './jobs/dispatch-notification.job.js';

const env = loadEnv();
const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const redis = new Redis(env.REDIS_URL);
const connection = { url: env.REDIS_URL };

const notificationQueue = new Queue('notifications:dispatch', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  },
});

const matchmakingQueue = new Queue('matchmaking:jobs', { connection });

await matchmakingQueue.add('pair-repeat', {}, { repeat: { every: 5000 }, jobId: 'matchmaking-pair-repeat' });
await matchmakingQueue.add('expire-repeat', {}, { repeat: { every: 30000 }, jobId: 'matchmaking-expire-repeat' });

const matchmakingWorker = new Worker(
  'matchmaking:jobs',
  async (job) => {
    if (job.name === 'pair-repeat') {
      await processPairPlayersJob(job, pool, redis, env, notificationQueue);
    } else if (job.name === 'expire-repeat') {
      await processExpireMatchesJob(job, pool, redis, notificationQueue);
    }
  },
  { connection, concurrency: 1 }
);

const notificationWorker = new Worker(
  'notifications:dispatch',
  async (job) => {
    if (job.name === 'dispatch') {
      await processDispatchNotificationJob(job, pool, redis, env);
    }
  },
  { connection, concurrency: 5 }
);

matchmakingWorker.on('failed', (job, err) => {
  console.error(`Matchmaking job ${job?.id} failed:`, err.message);
});

notificationWorker.on('failed', (job, err) => {
  console.error(`Notification job ${job?.id} failed:`, err.message);
});

console.log('Worker started — pairing every 5s, expire every 30s');

async function shutdown() {
  await matchmakingWorker.close();
  await notificationWorker.close();
  await matchmakingQueue.close();
  await notificationQueue.close();
  await pool.end();
  redis.disconnect();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
