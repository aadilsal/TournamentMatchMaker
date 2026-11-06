import { configuredEmailProviders, emailConfigFromEnv, sendEmailWithFallback } from '@vr-tournament/shared/email';
import type { Env } from '../config/env.js';

/**
 * Sends a transactional email through Resend, then SMTP, then SES — the first
 * configured provider that accepts it wins. Resolves true only when one did.
 */
export async function sendEmail(
  env: Env,
  to: string,
  subject: string,
  html: string
): Promise<boolean> {
  if (!env.NOTIFICATION_EMAIL_ENABLED) return false;

  const cfg = emailConfigFromEnv(env);
  if (configuredEmailProviders(cfg).length === 0) {
    // Bodies can carry reset links, so they are only printed outside production.
    if (env.NODE_ENV === 'production') console.error(`[email] not sent to ${to}: no email provider is configured`);
    else console.log(`[email:dev] To: ${to} | Subject: ${subject}\n${html}`);
    return false;
  }

  const result = await sendEmailWithFallback(cfg, { to, subject, html });
  if (!result.sent) console.error(`[email] not sent to ${to}: ${result.failures.join(' | ')}`);
  else if (result.failures.length) console.warn(`[email] sent via ${result.provider} after: ${result.failures.join(' | ')}`);
  return result.sent;
}
