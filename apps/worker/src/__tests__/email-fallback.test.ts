import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { configuredEmailProviders, sendEmailWithFallback, type EmailConfig } from '@vr-tournament/shared/email';

// Email must go out through whichever provider works: Resend → SMTP → SES.

const msg = { to: 'player@example.com', subject: 'Hi', html: '<p>hi</p>' };
const resend = { apiKey: 're_test_key', from: 'noreply@example.com' };
// Port 9 on localhost refuses at once, so the SMTP attempt fails fast.
const deadSmtp = { host: '127.0.0.1', port: 9, secure: false, user: 'u@example.com', pass: 'pw', from: 'u@example.com' };
const sampleSes = { region: 'us-east-1', accessKeyId: 'sample-aws-access-key', secretAccessKey: 'sample-aws-secret-key', from: 'n@example.com' };

afterEach(() => {
  jest.restoreAllMocks();
});

describe('email fallback chain', () => {
  it('lists only providers with real credentials, in send order', () => {
    expect(configuredEmailProviders({ resend, smtp: deadSmtp, ses: sampleSes })).toEqual(['resend', 'smtp']);
    expect(configuredEmailProviders({ resend: { apiKey: 'sample-key', from: 'a@b.co' }, ses: sampleSes })).toEqual([]);
    expect(configuredEmailProviders({ smtp: { ...deadSmtp, host: undefined } })).toEqual([]);
  });

  it('sends via Resend when it accepts, without touching SMTP', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"id":"1"}', { status: 200 }));
    const r = await sendEmailWithFallback({ resend, smtp: deadSmtp }, msg);
    expect(r).toEqual({ sent: true, provider: 'resend', failures: [] });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('falls through every configured provider and reports each failure', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('domain not verified', { status: 403 }));
    const r = await sendEmailWithFallback({ resend, smtp: deadSmtp, ses: sampleSes }, msg);
    expect(r.sent).toBe(false);
    expect(r.failures).toHaveLength(2);
    expect(r.failures[0]).toMatch(/^resend: Resend 403/);
    expect(r.failures[1]).toMatch(/^smtp: /);
  });

  it('says so when nothing is configured', async () => {
    const cfg: EmailConfig = { ses: sampleSes };
    expect(await sendEmailWithFallback(cfg, msg)).toEqual({ sent: false, provider: null, failures: ['no email provider is configured'] });
  });
});
