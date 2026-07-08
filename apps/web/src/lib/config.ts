/**
 * Backend API base (HTTP + Socket.IO).
 * Always the public host in production builds — never localhost.
 * Local `vite` injects a override via vite.config.ts `define` (__APP_API_URL__).
 */

declare const __APP_API_URL__: string | undefined;

export const PRODUCTION_API_URL = 'https://api.tournament.pixelpaddle.com';

export const API_URL: string =
  typeof __APP_API_URL__ !== 'undefined' && __APP_API_URL__
    ? __APP_API_URL__.replace(/\/$/, '')
    : PRODUCTION_API_URL;
