import { Queue } from 'bullmq';
import {
  BULLMQ_MATCHMAKING_QUEUE,
  MATCHMAKING_JOB_CLOSE_ROUND_NOW,
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

/**
 * Job ids are separated with `~`, never `:`.
 *
 * BullMQ 5 rejects a custom id containing a colon — except when it splits into
 * exactly three parts, a carve-out kept for old repeatable job keys. An id like
 * `pair-now:<tournament>:<timestamp>` slips through on that exemption alone, so
 * anything that changed the shape by one segment would have started throwing
 * from inside a queue nudge. `~` matches the separator the notification jobs
 * already use and has no special meaning to BullMQ.
 */
const jobId = (...parts: Array<string | number>) => parts.join('~');

/** Trigger immediate pairing after a player joins a queue. */
export async function enqueuePairNow(env: Env, tournamentId?: string | null) {
  const queue = getMatchmakingQueue(env);
  const scope = tournamentId ?? 'global';
  await queue.add(
    MATCHMAKING_JOB_PAIR_NOW,
    { tournamentId: tournamentId ?? null },
    {
      jobId: jobId('pair-now', scope, Date.now()),
      removeOnComplete: true,
      removeOnFail: true,
    }
  );
}

/**
 * Ask for an expired round to be closed now rather than at the next sweep.
 *
 * Keyed on the tournament and left un-timestamped on purpose: players poll this
 * every couple of seconds, and a unique id per poll would queue one redundant
 * close per player per tick. While one is pending, further requests collapse
 * onto it.
 */
export async function enqueueCloseRoundNow(env: Env, tournamentId: string) {
  const queue = getMatchmakingQueue(env);
  await queue.add(
    MATCHMAKING_JOB_CLOSE_ROUND_NOW,
    { tournamentId },
    {
      jobId: jobId('close-round-now', tournamentId),
      removeOnComplete: true,
      removeOnFail: true,
    }
  );
}
