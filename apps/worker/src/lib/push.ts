import webpush from 'web-push';
import type { Pool } from 'pg';
import type { WorkerEnv } from '../config/env.js';

// Push services require an https: or mailto: contact; local APP_URL is plain http.
const SUBJECT_FALLBACK = 'https://tournament.pixelpaddle.com';
let configured = false;

function ready(env: WorkerEnv): boolean {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return false;
  if (!configured) {
    const subject = env.APP_URL.startsWith('https://') ? env.APP_URL : SUBJECT_FALLBACK;
    webpush.setVapidDetails(subject, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    configured = true;
  }
  return true;
}

/** Sends one alert to every phone the player turned alerts on for; drops phones that are gone. */
export async function sendPushToUser(
  pool: Pool,
  env: WorkerEnv,
  userId: string,
  type: string,
  payload: Record<string, unknown>
): Promise<number> {
  if (!ready(env)) return 0;
  const subs = await pool.query(`SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`, [userId]);
  if (!subs.rowCount) return 0;

  const body = JSON.stringify({
    title: typeof payload.title === 'string' ? payload.title : 'VR Cricket League',
    body: typeof payload.message === 'string' ? payload.message : '',
    url: typeof payload.link === 'string' && payload.link.startsWith('/') ? payload.link : '/my-tournaments',
    tag: type,
  });

  let sent = 0;
  await Promise.all(
    subs.rows.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 60 * 60 });
        sent += 1;
        await pool.query(`UPDATE push_subscriptions SET last_sent_at = NOW() WHERE id = $1`, [s.id]);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410: the phone uninstalled the app or turned alerts off.
        if (status === 404 || status === 410) {
          await pool.query(`DELETE FROM push_subscriptions WHERE id = $1`, [s.id]);
        } else {
          console.warn(`[push] not delivered to a phone of ${userId}: ${status ?? (err as Error).message}`);
        }
      }
    })
  );
  return sent;
}
