// One-tap sign-in links in emails: single use, players only, short-lived.
export const LOGIN_LINK_TTL_MINUTES = 30;
export const PLAYER_SESSION_DAYS = 30;
export const ADMIN_SESSION_DAYS = 7;

/** The token rides in the URL fragment so it never reaches server logs. */
export function loginLinkUrl(appUrl: string, token: string, nextPath: string): string {
  return `${appUrl}/auto-login#t=${encodeURIComponent(token)}&next=${encodeURIComponent(nextPath)}`;
}

export function sessionDaysForRole(role: string): number {
  return role === 'player' ? PLAYER_SESSION_DAYS : ADMIN_SESSION_DAYS;
}
