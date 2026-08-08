/** BullMQ queue names — must not contain colons (BullMQ 5.x restriction). */
export const BULLMQ_NOTIFICATIONS_QUEUE = 'notifications-dispatch';
export const BULLMQ_MATCHMAKING_QUEUE = 'matchmaking-jobs';

export const MATCHMAKING_JOB_PAIR_NOW = 'pair-now';
export const MATCHMAKING_JOB_PAIR_REPEAT = 'pair-repeat';
/**
 * A round shuts the moment its window ends, but the round that replaces it is
 * created by a sweep. Between the two, every player in that round is frozen —
 * no solo innings, no pairing. The API asks for the close as soon as a poll
 * shows an expired round, so the gap is as long as the job takes rather than as
 * long as the sweep interval.
 */
export const MATCHMAKING_JOB_CLOSE_ROUND_NOW = 'close-round-now';
