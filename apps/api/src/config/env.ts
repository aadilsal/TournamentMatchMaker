import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().email().default('notifications@vrtournament.com'),
  // SMTP fallback (any mailbox provider) when Resend is unset or rejects a send.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM_EMAIL: z.string().email().optional(),
  NOTIFICATION_EMAIL_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  APP_URL: z.string().default('http://localhost:5173'),
  META_API_KEY: z.string().min(16).default('sample-meta-api-key-change-me'),
  META_SSH_PUBLIC_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().default('sk_test_sample_change_me'),
  STRIPE_WEBHOOK_SECRET: z.string().default('whsec_sample_change_me'),
  AWS_ACCESS_KEY_ID: z.string().default('sample-aws-access-key'),
  AWS_SECRET_ACCESS_KEY: z.string().default('sample-aws-secret-key'),
  AWS_REGION: z.string().default('us-east-1'),
  AWS_SES_FROM_EMAIL: z.string().email().default('notifications@pixelpaddle.com'),
});

export type Env = z.infer<typeof envSchema>;

const PLACEHOLDER_SECRET = /sample|change|dev-/i;
const PRODUCTION_SECRETS = ['META_API_KEY', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const;

/** Secrets still holding a default/sample value; only enforced in production. */
export function placeholderSecrets(env: Env): string[] {
  if (env.NODE_ENV !== 'production') return [];
  return PRODUCTION_SECRETS.filter((key) => PLACEHOLDER_SECRET.test(env[key]));
}

export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:', result.error.flatten().fieldErrors);
    throw new Error('Invalid environment configuration');
  }
  const unsafe = placeholderSecrets(result.data);
  if (unsafe.length > 0) {
    console.error(`Refusing to start in production with placeholder secrets: ${unsafe.join(', ')}`);
    throw new Error('Invalid environment configuration');
  }
  return result.data;
}
