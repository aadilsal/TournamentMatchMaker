import { Queue } from 'bullmq';
import {
  BULLMQ_MATCHMAKING_QUEUE,
  MATCHMAKING_JOB_PAIR_NOW,
} from '@vr-tournament/shared';
import type { Env } from '../config/env.js';

let matchmakingQueue: Queue | null = null;

export function getMatchmakingQueue(env: Env): Queue {
  if (!matchmakingQueue) {
    matchmakingQueue = new Queue(BULLMQ_MATCHMAKING_QUEUE, {
      connection: { url: env.REDIS_URL },
      defaultJobOptions: {
        removeOnComplete: 200,
        removeOnFail: 100,
      },
    });
  }
  return matchmakingQueue;
}

/** Trigger immediate pairing after a player joins a queue. */
export async function enqueuePairNow(env: Env, tournamentId?: string | null) {
  const queue = getMatchmakingQueue(env);
  const scope = tournamentId ?? 'global';
  await queue.add(
    MATCHMAKING_JOB_PAIR_NOW,
    { tournamentId: tournamentId ?? null },
    {
      jobId: `pair-now:${scope}:${Date.now()}`,
      removeOnComplete: true,
      removeOnFail: true,
    }
  );
}
