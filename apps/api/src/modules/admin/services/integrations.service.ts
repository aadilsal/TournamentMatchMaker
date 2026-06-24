import type { Env } from '../../../config/env.js';
import { enqueueNotification } from '../../../lib/bullmq.js';

export class AdminIntegrationsService {
  constructor(private env: Env) {}

  getConfig() {
    return {
      meta: {
        configured: !!this.env.META_API_KEY,
        apiKeyPreview: this.env.META_API_KEY
          ? `${this.env.META_API_KEY.slice(0, 6)}…`
          : null,
      },
      email: {
        enabled: this.env.NOTIFICATION_EMAIL_ENABLED,
        provider: this.env.RESEND_API_KEY ? 'resend' : this.env.AWS_ACCESS_KEY_ID ? 'ses' : 'console',
        from: this.env.RESEND_FROM_EMAIL ?? this.env.AWS_SES_FROM_EMAIL ?? null,
      },
      stripe: {
        configured: !!this.env.STRIPE_SECRET_KEY && !this.env.STRIPE_SECRET_KEY.includes('sample'),
        mode: this.env.STRIPE_SECRET_KEY?.startsWith('sk_live') ? 'live' : 'test',
      },
    };
  }

  async sendTestEmail(userId: string) {
    await enqueueNotification(this.env, {
      userId,
      type: 'admin_test',
      channels: ['email', 'in_app'],
      payload: { message: 'Admin test email from VR Cricket League' },
      idempotencyKey: `admin-test:${userId}:${Date.now()}`,
    });
    return { queued: true };
  }
}
