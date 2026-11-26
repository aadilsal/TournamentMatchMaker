import { z } from 'zod';
import { BALLS_PER_OVER, MAX_OVERS } from '../overs.js';

export const metaSubmitScoreSchema = z.object({
  userId: z.string().uuid(),
  score: z.number().int().min(0).max(999),
  // Optional, recorded for checking only; never used to reject a score.
  ballsFaced: z.number().int().min(0).max(MAX_OVERS * BALLS_PER_OVER).optional(),
  // Optional batting breakdown for stats; dropped (not rejected) when it does not fit the score.
  fours: z.number().int().min(0).max(MAX_OVERS * BALLS_PER_OVER).optional(),
  sixes: z.number().int().min(0).max(MAX_OVERS * BALLS_PER_OVER).optional(),
  wicketsLost: z.number().int().min(0).max(MAX_OVERS * BALLS_PER_OVER).optional(),
});

/** `POST /matches/:id/start` and `/heartbeat`: the batter's user id. */
export const metaInningsActionSchema = z.object({
  userId: z.string().uuid(),
});

export const metaSoloTargetSchema = z.object({
  userId: z.string().uuid(),
  tournamentId: z.string().uuid(),
  target: z.number().int().min(0).max(999),
});

const isTimeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/** Optional IANA time zone for human-readable times in responses. */
export const timeZoneQuerySchema = z.object({
  timeZone: z.string().max(64).refine(isTimeZone, 'Unknown time zone').optional(),
});

export const metaPlayerCardQuerySchema = z.object({
  userId: z.string().uuid(),
  /** IANA zone (e.g. Asia/Karachi) for the times in `statusText`; UTC when omitted. */
  timeZone: z.string().max(64).refine(isTimeZone, 'Unknown time zone').optional(),
});

export const metaCurrentMatchQuerySchema = z.object({
  userId: z.string().uuid(),
  /** Optional: only this tournament's match, for a player in several. */
  tournamentId: z.string().uuid().optional(),
  /** `true` from headsets that call `/start`; polling then never claims the turn. */
  explicitStart: z.enum(['true', 'false']).optional(),
});

/**
 * Guards `POST /matches/:id/scores`. Without this a stale or malformed match id
 * (e.g. one the headset cached across a rematch) reaches Postgres as invalid
 * uuid syntax and surfaces as a 500 instead of a 400 the client can handle.
 */
export const metaMatchIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const metaVerifyLinkCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{4}$/, 'Code must be a 4-digit code'),
});

export type MetaSubmitScoreInput = z.infer<typeof metaSubmitScoreSchema>;
export type MetaSoloTargetInput = z.infer<typeof metaSoloTargetSchema>;
export type MetaInningsActionInput = z.infer<typeof metaInningsActionSchema>;
export type MetaVerifyLinkCodeInput = z.infer<typeof metaVerifyLinkCodeSchema>;
