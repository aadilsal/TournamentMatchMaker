import type { Pool } from 'pg';
import { configuredEmailProviders, emailConfigFromEnv, sendEmailWithFallback } from '@vr-tournament/shared/email';
import type { Env } from '../../../config/env.js';
import { isStripeConfigured } from '../../../lib/stripe.js';
import { AppError } from '../../../lib/response.js';

export class AdminIntegrationsService {
  constructor(
    private env: Env,
    private pool: Pool
  ) {}

  getConfig() {
    const cfg = emailConfigFromEnv(this.env);
    const providers = configuredEmailProviders(cfg);
    const first = providers[0];
    return {
      meta: {
        configured: !!this.env.META_API_KEY,
        apiKeyPreview: this.env.META_API_KEY
          ? `${this.env.META_API_KEY.slice(0, 6)}…`
          : null,
      },
      email: {
        enabled: this.env.NOTIFICATION_EMAIL_ENABLED,
        provider: first ?? 'none',
        from: first ? cfg[first]!.from : null,
        providers,
      },
      stripe: {
        configured: isStripeConfigured(this.env),
        mode: this.env.STRIPE_SECRET_KEY?.startsWith('sk_live') ? 'live' : 'test',
      },
    };
  }

  /** Sends now, not via the queue, so the admin sees which provider delivered or why none did. */
  async sendTestEmail(userId: string) {
    const { rows } = await this.pool.query<{ email: string }>('SELECT email FROM users WHERE id = $1', [userId]);
    if (!rows[0]) throw new AppError('NOT_FOUND', 'User not found', 404);
    const result = await sendEmailWithFallback(emailConfigFromEnv(this.env), {
      to: rows[0].email,
      subject: 'VR Cricket League — test email',
      html: '<p>This is a test email from the VR Cricket League admin panel. Email delivery works.</p>',
    });
    return { sent: result.sent, provider: result.provider, failures: result.failures, to: rows[0].email };
  }
}
