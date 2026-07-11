import { z } from 'zod';

export const metaSubmitScoreSchema = z.object({
  userId: z.string().uuid(),
  score: z.number().int().min(0).max(999),
});

export const metaSoloTargetSchema = z.object({
  userId: z.string().uuid(),
  tournamentId: z.string().uuid(),
  target: z.number().int().min(0).max(999),
});

export const metaCurrentMatchQuerySchema = z.object({
  userId: z.string().uuid(),
});

export const metaRequestOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export const metaVerifyOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'OTP must be a 6-digit code'),
});

export type MetaSubmitScoreInput = z.infer<typeof metaSubmitScoreSchema>;
export type MetaSoloTargetInput = z.infer<typeof metaSoloTargetSchema>;
export type MetaRequestOtpInput = z.infer<typeof metaRequestOtpSchema>;
export type MetaVerifyOtpInput = z.infer<typeof metaVerifyOtpSchema>;
