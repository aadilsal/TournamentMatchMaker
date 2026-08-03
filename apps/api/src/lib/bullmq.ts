import { Queue } from 'bullmq';
import { BULLMQ_NOTIFICATIONS_QUEUE } from '@vr-tournament/shared';
import type { Env } from '../config/env.js';

let notificationQueue: Queue | null = null;

export function getNotificationQueue(env: Env): Queue {
  if (!notificationQueue) {
    notificationQueue = new Queue(BULLMQ_NOTIFICATIONS_QUEUE, {
      connection: { url: env.REDIS_URL },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });
  }
  return notificationQueue;
}

export interface NotificationJobData {
  userId: string;
  type: string;
  channels: Array<'in_app' | 'email'>;
  payload: Record<string, unknown>;
  idempotencyKey: string;
}

/**
 * BullMQ rejects a custom job id containing ':' unless it happens to split into
 * exactly three parts, so a two- or four-segment idempotency key throws at
 * enqueue time (silently, wherever the caller swallows the rejection). Callers
 * shouldn't have to count colons — normalise the delimiter here instead.
 */
export function toJobId(idempotencyKey: string): string {
  return idempotencyKey.replace(/:/g, '~');
}

export async function enqueueNotification(env: Env, data: NotificationJobData) {
  const queue = getNotificationQueue(env);
  await queue.add('dispatch', data, { jobId: toJobId(data.idempotencyKey) });
}
