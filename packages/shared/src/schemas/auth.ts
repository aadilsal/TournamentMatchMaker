import { z } from 'zod';

/** One rule for every place a password is chosen; the web strength meter mirrors it. */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const registerSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: passwordSchema,
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username must be 50 characters or fewer')
    .regex(/^[a-zA-Z0-9_]+$/, 'Use only letters, numbers, and underscores'),
  country: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  hasVrHeadset: z.boolean().optional().default(false),
  vrDeviceType: z.string().max(100).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Enter a valid email address'),
});

// Token is deliberately loose so a mangled link gets the same "invalid or expired" answer.
export const resetPasswordSchema = z.object({
  token: z.string().min(1).max(256),
  password: passwordSchema,
});

export const registerFormSchema = registerSchema
  .extend({
    confirmPassword: z.string().min(1, 'Please re-enter your password'),
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: 'Please accept the terms to create your account' }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type RegisterFormInput = z.infer<typeof registerFormSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
