/** Returns `raw` only when it is a same-origin path ("/x", never "//x" or "/\x"); otherwise null. */
export function sanitizeReturnTo(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  // Browsers treat "\" as "/" and strip tabs/newlines, so "/\evil.com" would leave the origin.
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return null;
  try {
    const base = 'http://same.origin';
    const url = new URL(raw, base);
    if (url.origin !== base) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

const AUTH_PAGES = ['/login', '/register', '/forgot-password', '/reset-password'];

/** Where to land after sign-in: a safe returnTo, else /admin for admins, else /venues. */
export function postLoginPath(raw: string | null | undefined, isAdmin: boolean): string {
  const safe = sanitizeReturnTo(raw);
  if (safe && !AUTH_PAGES.some((p) => safe === p || safe.startsWith(`${p}?`))) return safe;
  return isAdmin ? '/admin' : '/venues';
}
