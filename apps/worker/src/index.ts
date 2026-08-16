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
  MATCHMAKING_JOB_CLOSE_ROUND_NOW,
  MATCHMAKING_JOB_PAIR_NOW,
  MATCHMAKING_JOB_PAIR_REPEAT,
} from '@vr-tournament/shared';
import { loadEnv } from './config/env.js';
import { processPairPlayersJob } from './jobs/pair-players.job.js';
import { processExpireMatchesJob } from './jobs/expire-matches.job.js';
import { processExpireUnplayedSlotsJob } from './jobs/expire-unplayed-slots.job.js';
import { processCloseRoundJob } from './jobs/close-round.job.js';
import { processReconcileQueueJob } from './jobs/reconcile-queue.job.js';
import { processEnrollParticipantsJob } from './jobs/enroll-participants.job.js';
import { processTournamentLifecycleJob } from './jobs/tournament-lifecycle.job.js';
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

const REPEAT_JOBS = [
  { name: MATCHMAKING_JOB_PAIR_REPEAT, every: 2000, jobId: 'matchmaking-pair-repeat' },
  { name: 'expire-repeat', every: 30000, jobId: 'matchmaking-expire-repeat' },
  { name: 'expire-unplayed-repeat', every: 60000, jobId: 'matchmaking-expire-unplayed-repeat' },
  // The gap between a round's `ends_at` and this sweep is dead time for every
  // player in it: the API reads the clock live, so it reports the round shut the
  // instant it expires, while the round that replaces it does not exist until
  // the sweep runs. Players poll every 2-5s and saw `canSubmitSoloTarget` sit
  // false for up to a minute with nothing to explain it. One indexed query per
  // tick is cheap; the wait a player can see is not.
  { name: 'close-round-repeat', every: 15000, jobId: 'matchmaking-close-round-repeat' },
  // Registration closing, play starting and the tournament completing all happen
  // on their own schedule; nothing used to move a tournament forward but an admin.
  { name: 'tournament-lifecycle-repeat', every: 60000, jobId: 'matchmaking-tournament-lifecycle-repeat' },
  // The queue is in Redis and the right to play is in Postgres; they drift.
  { name: 'reconcile-queue-repeat', every: 60000, jobId: 'matchmaking-reconcile-queue-repeat' },
  // Registering for a tournament put nobody in its matchmaking queue, so a
  // tournament could go live with a full field and nothing to pair. This is the
  // step that joins the two, and it repeats so a queue lost to a Redis restart
  // or a worker outage refills itself.
  { name: 'enroll-participants-repeat', every: 10000, jobId: 'matchmaking-enroll-participants-repeat' },
] as const;

// A repeat interval is part of the schedule's identity in Redis, not a property
// that can be edited: re-adding one with a new `every` registers a second
// schedule and leaves the old one ticking. Retiring anything that no longer
// matches this table means changing an interval here actually changes it.
for (const existing of await matchmakingQueue.getRepeatableJobs()) {
  const wanted = REPEAT_JOBS.find((j) => j.name === existing.name);
  if (!wanted || Number(existing.every) !== wanted.every) {
    await matchmakingQueue.removeRepeatableByKey(existing.key);
    console.log(`Retired stale schedule ${existing.name} (every ${existing.every}ms)`);
  }
}

for (const job of REPEAT_JOBS) {
  await matchmakingQueue.add(job.name, {}, { repeat: { every: job.every }, jobId: job.jobId });
}

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
    } else if (job.name === 'close-round-repeat' || job.name === MATCHMAKING_JOB_CLOSE_ROUND_NOW) {
      await processCloseRoundJob(job, pool, redis);
    } else if (job.name === 'reconcile-queue-repeat') {
      await processReconcileQueueJob(job, pool, redis);
    } else if (job.name === 'tournament-lifecycle-repeat') {
      await processTournamentLifecycleJob(job, pool, redis);
      // A tournament that just went live has a field waiting outside the queue;
      // enrol it now rather than on the enrolment job's own next tick.
      await processEnrollParticipantsJob(job, pool, redis, notificationQueue);
    } else if (job.name === 'enroll-participants-repeat') {
      await processEnrollParticipantsJob(job, pool, redis, notificationQueue);
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
