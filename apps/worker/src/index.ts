import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });

import pg from 'pg';
import { Redis } from 'ioredis';
import { Queue, Worker } from 'bullmq';
import {
  BULLMQ_MATCHMAKING_QUEUE,
  BULLMQ_NOTIFICATIONS_QUEUE,
  MATCHMAKING_JOB_PAIR_NOW,
  MATCHMAKING_JOB_PAIR_REPEAT,
} from '@vr-tournament/shared';
import { loadEnv } from './config/env.js';
import { processPairPlayersJob } from './jobs/pair-players.job.js';
import { processExpireMatchesJob } from './jobs/expire-matches.job.js';
import { processExpireUnplayedSlotsJob } from './jobs/expire-unplayed-slots.job.js';
import { processCloseRoundJob } from './jobs/close-round.job.js';
import { processDispatchNotificationJob } from './jobs/dispatch-notification.job.js';

const env = loadEnv();
const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const redis = new Redis(env.REDIS_URL);
const connection = { url: env.REDIS_URL };

const notificationQueue = new Queue(BULLMQ_NOTIFICATIONS_QUEUE, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  },
});

const matchmakingQueue = new Queue(BULLMQ_MATCHMAKING_QUEUE, { connection });

await matchmakingQueue.add(
  MATCHMAKING_JOB_PAIR_REPEAT,
  {},
  { repeat: { every: 2000 }, jobId: 'matchmaking-pair-repeat' }
);
await matchmakingQueue.add('expire-repeat', {}, { repeat: { every: 30000 }, jobId: 'matchmaking-expire-repeat' });
await matchmakingQueue.add('expire-unplayed-repeat', {}, { repeat: { every: 60000 }, jobId: 'matchmaking-expire-unplayed-repeat' });
await matchmakingQueue.add('close-round-repeat', {}, { repeat: { every: 3600000 }, jobId: 'matchmaking-close-round-repeat' });

const matchmakingWorker = new Worker(
  BULLMQ_MATCHMAKING_QUEUE,
  async (job) => {
    if (job.name === MATCHMAKING_JOB_PAIR_NOW || job.name === MATCHMAKING_JOB_PAIR_REPEAT) {
      const tournamentId = (job.data as { tournamentId?: string | null })?.tournamentId ?? undefined;
      await processPairPlayersJob(job, pool, redis, env, notificationQueue, tournamentId);
    } else if (job.name === 'expire-repeat') {
      await processExpireMatchesJob(job, pool, redis, notificationQueue);
    } else if (job.name === 'expire-unplayed-repeat') {
      await processExpireUnplayedSlotsJob(job, pool, redis);
    } else if (job.name === 'close-round-repeat') {
      await processCloseRoundJob(job, pool);
    }
  },
  { connection, concurrency: 3 }
);

const notificationWorker = new Worker(
  BULLMQ_NOTIFICATIONS_QUEUE,
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

console.log('Worker started — instant pair-now jobs + backup poll every 2s');

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
