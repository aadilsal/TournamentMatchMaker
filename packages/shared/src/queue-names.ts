/** BullMQ queue names — must not contain colons (BullMQ 5.x restriction). */
export const BULLMQ_NOTIFICATIONS_QUEUE = 'notifications-dispatch';
export const BULLMQ_MATCHMAKING_QUEUE = 'matchmaking-jobs';

export const MATCHMAKING_JOB_PAIR_NOW = 'pair-now';
export const MATCHMAKING_JOB_PAIR_REPEAT = 'pair-repeat';
