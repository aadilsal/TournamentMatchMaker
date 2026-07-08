import { describe, expect, it } from '@jest/globals';
import { isStripeConfigured } from '../lib/stripe.js';
import type { Env } from '../config/env.js';

const baseEnv = {
  NODE_ENV: 'test',
  PORT: 3000,
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  JWT_REFRESH_SECRET: 'y'.repeat(32),
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '7d',
  CORS_ORIGIN: 'http://localhost:5173',
  RESEND_FROM_EMAIL: 'notifications@vrtournament.com',
  NOTIFICATION_EMAIL_ENABLED: true,
  APP_URL: 'http://localhost:5173',
  META_API_KEY: 'sample-meta-api-key-change-me',
  STRIPE_SECRET_KEY: 'sk_test_sample_change_me',
  STRIPE_WEBHOOK_SECRET: 'whsec_sample_change_me',
  AWS_ACCESS_KEY_ID: 'sample-aws-access-key',
  AWS_SECRET_ACCESS_KEY: 'sample-aws-secret-key',
  AWS_REGION: 'us-east-1',
  AWS_SES_FROM_EMAIL: 'notifications@pixelpaddle.com',
} satisfies Env;

describe('isStripeConfigured', () => {
  it('returns false for sample keys', () => {
    expect(isStripeConfigured(baseEnv)).toBe(false);
  });

  it('returns true for real-looking keys', () => {
    expect(
      isStripeConfigured({
        ...baseEnv,
        STRIPE_SECRET_KEY: 'sk_test_51AbCdEf',
        STRIPE_WEBHOOK_SECRET: 'whsec_real_secret_value',
      })
    ).toBe(true);
  });
});
