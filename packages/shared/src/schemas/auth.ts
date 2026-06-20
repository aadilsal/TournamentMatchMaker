import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password is too long'),
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
