import type { Job } from 'bullmq';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { Resend } from 'resend';
import type { WorkerEnv } from '../config/env.js';
import { emitToUser } from '../lib/socket-bridge.js';
import { matchFoundEmailHtml } from '../templates/match-found.email.js';
import { tournamentRegisteredEmailHtml } from '../templates/tournament-registered.email.js';

export interface NotificationJobData {
  userId: string;
  type: string;
  channels: Array<'in_app' | 'email'>;
  payload: Record<string, unknown>;
  idempotencyKey: string;
}

async function upsertNotification(
  pool: Pool,
  userId: string,
  type: string,
  channel: 'in_app' | 'email',
  payload: Record<string, unknown>,
  idempotencyKey: string,
  status: 'pending' | 'sent' | 'failed' = 'pending'
) {
  const result = await pool.query(
    `INSERT INTO notifications (user_id, type, channel, payload, idempotency_key, status, sent_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, idempotency_key) DO UPDATE
       SET status = EXCLUDED.status, sent_at = EXCLUDED.sent_at
     RETURNING *`,
    [
      userId,
      type,
      channel,
      JSON.stringify(payload),
      idempotencyKey,
      status,
      status === 'sent' ? new Date() : null,
    ]
  );
  return result.rows[0];
}

async function sendEmail(env: WorkerEnv, to: string, subject: string, html: string) {
  if (!env.NOTIFICATION_EMAIL_ENABLED) return true;

  if (!env.RESEND_API_KEY) {
    console.log(`[email:dev] To: ${to} | Subject: ${subject}\n${html}`);
    return true;
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to,
    subject,
    html,
  });
  if (error) throw new Error(error.message);
  return true;
}

export async function processDispatchNotificationJob(
  job: Job<NotificationJobData>,
  pool: Pool,
  redis: Redis,
  env: WorkerEnv
) {
  const { userId, type, channels, payload, idempotencyKey } = job.data;

  if (channels.includes('in_app')) {
    const row = await upsertNotification(
      pool,
      userId,
      type,
      'in_app',
      payload,
      `${idempotencyKey}:in_app`,
      'sent'
    );
    await emitToUser(redis, userId, 'notification:new', {
      notification: {
        id: row.id,
        userId: row.user_id,
        type: row.type,
        channel: row.channel,
        payload: row.payload,
        read: row.read,
        status: row.status,
        sentAt: row.sent_at?.toISOString?.() ?? null,
        createdAt: row.created_at.toISOString(),
      },
    });
  }

  if (channels.includes('email')) {
    const userResult = await pool.query(`SELECT email, username FROM users WHERE id = $1`, [userId]);
    const user = userResult.rows[0];
    if (!user) return;

    let subject = 'VR Tournament Notification';
    let html = `<p>You have a new notification: ${type}</p>`;

    if (type === 'match_found') {
      const opponent = payload.opponent as { username?: string } | undefined;
      const venue = payload.venue as { name?: string } | undefined;
      const slot = payload.slot as { startTime?: string } | undefined;
      subject = 'Match Found — Confirm Now';
      html = matchFoundEmailHtml({
        opponentUsername: opponent?.username ?? 'opponent',
        venueName: venue?.name,
        slotStart: slot?.startTime,
        confirmUrl: `${env.APP_URL}/matches`,
      });
    } else if (type === 'tournament_registered') {
      subject = 'Tournament Registration Confirmed';
      html = tournamentRegisteredEmailHtml({
        tournamentName: String(payload.tournamentName ?? 'Tournament'),
        startDate: String(payload.startDate ?? new Date().toISOString()),
        bracketUrl: `${env.APP_URL}/tournaments/${payload.tournamentId}`,
      });
    } else if (type === 'match_confirmed') {
      subject = 'Match Confirmed';
      html = `<p>Your match has been confirmed. <a href="${env.APP_URL}/matches">View details</a></p>`;
    } else if (type === 'match_expired') {
      subject = 'Match Expired';
      html = `<p>Your match confirmation window expired. <a href="${env.APP_URL}/matchmaking">Rejoin queue</a></p>`;
    }

    try {
      await sendEmail(env, user.email, subject, html);
      await upsertNotification(pool, userId, type, 'email', payload, `${idempotencyKey}:email`, 'sent');
    } catch (err) {
      await upsertNotification(pool, userId, type, 'email', payload, `${idempotencyKey}:email`, 'failed');
      throw err;
    }
  }
}
