/**
 * API base URL for the web app.
 * Production builds must set VITE_API_URL (enforced in vite.config.ts).
 * Local `vite` / `vite build --mode development` may fall back to localhost.
 */
const raw = import.meta.env.VITE_API_URL?.trim();

function resolveApiUrl(): string {
  if (raw) {
    if (import.meta.env.PROD && /localhost|127\.0\.0\.1/i.test(raw)) {
      throw new Error(
        `Invalid production VITE_API_URL (localhost is not allowed): ${raw}`
      );
    }
    return raw.replace(/\/$/, '');
  }

  if (import.meta.env.DEV) {
    return 'http://localhost:3000';
  }

  throw new Error(
    'VITE_API_URL is missing. Rebuild the web app with VITE_API_URL set to your public API URL.'
  );
}

export const API_URL = resolveApiUrl();
