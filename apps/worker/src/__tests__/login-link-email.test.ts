import { describe, expect, it } from '@jest/globals';
import { renderNotificationEmail, passwordResetEmail } from '@vr-tournament/shared/email';

// Email buttons carry a one-tap sign-in link and say it expires in 30 minutes.

const APP = 'https://tournament.example.com';
const payload = { emailData: { tournamentName: 'Cup', roundLabel: 'Round 1', opponent: 'Ali', closesAt: new Date(Date.now() + 3600e3) } };

describe('sign-in links in emails', () => {
  it('routes the button through /auto-login with the token in the fragment', () => {
    const email = renderNotificationEmail('round_started', payload, APP, 'tok123')!;
    const href = `${APP}/auto-login#t=tok123&amp;next=%2Fmy-tournaments`;
    expect(email.html).toContain(href);
    expect(email.html).toContain('expires in 30 minutes');
    expect(email.text).toContain(`${APP}/auto-login#t=tok123&next=%2Fmy-tournaments`);
    expect(email.text).toContain('signs you in automatically and expires in 30 minutes');
  });

  it('keeps plain links when there is no token', () => {
    const email = renderNotificationEmail('round_started', payload, APP)!;
    expect(email.html).toContain(`${APP}/my-tournaments`);
    expect(email.html).not.toContain('auto-login');
    expect(email.html).not.toContain('expires in 30 minutes');
  });

  it('never adds sign-in to the password reset email', () => {
    expect(passwordResetEmail({ link: `${APP}/reset-password?token=x` }, APP).html).not.toContain('auto-login');
  });
});
