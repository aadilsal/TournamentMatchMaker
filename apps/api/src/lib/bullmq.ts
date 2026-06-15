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

export async function enqueueNotification(env: Env, data: NotificationJobData) {
  const queue = getNotificationQueue(env);
  await queue.add('dispatch', data, { jobId: data.idempotencyKey });
}
