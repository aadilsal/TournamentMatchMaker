// Server-only (exported as @vr-tournament/shared/email); never import from the web app.
import nodemailer from 'nodemailer';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

export type EmailProvider = 'resend' | 'smtp' | 'ses';

export interface EmailConfig {
  /** Display name shown as the sender, e.g. "VR Cricket League by Pixel Paddle". */
  fromName?: string;
  /** Page where players manage notifications (List-Unsubscribe). */
  unsubscribeUrl?: string;
  resend?: { apiKey?: string; from: string };
  smtp?: { host?: string; port: number; secure: boolean; user?: string; pass?: string; from: string };
  ses?: { region: string; accessKeyId: string; secretAccessKey: string; from: string };
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  /** Plain-text part; derived from the HTML when omitted (HTML-only mail scores as spam). */
  text?: string;
}

/** What every provider sends besides the body: named sender and unsubscribe headers. */
interface Envelope {
  from: string;
  text: string;
  headers: Record<string, string>;
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<(br|\/p|\/tr|\/h1|\/div)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function envelope(cfg: EmailConfig, address: string, msg: EmailMessage): Envelope {
  const name = cfg.fromName?.replace(/["\r\n]/g, '').trim();
  const unsub = [`<mailto:${address}?subject=unsubscribe>`, ...(cfg.unsubscribeUrl ? [`<${cfg.unsubscribeUrl}>`] : [])];
  return {
    from: name ? `"${name}" <${address}>` : address,
    text: msg.text ?? htmlToText(msg.html),
    headers: { 'List-Unsubscribe': unsub.join(', ') },
  };
}

export type EmailResult =
  | { sent: true; provider: EmailProvider; failures: string[] }
  | { sent: false; provider: null; failures: string[] };

const TIMEOUT_MS = 10_000;
const isPlaceholder = (v?: string) => !v || /^(sample|change|your[-_])/i.test(v.trim());

/** Providers that have real-looking credentials, in the order they are tried. */
export function configuredEmailProviders(cfg: EmailConfig): EmailProvider[] {
  const out: EmailProvider[] = [];
  if (cfg.resend && !isPlaceholder(cfg.resend.apiKey)) out.push('resend');
  if (cfg.smtp && cfg.smtp.host && !isPlaceholder(cfg.smtp.user) && !isPlaceholder(cfg.smtp.pass)) out.push('smtp');
  if (cfg.ses && !isPlaceholder(cfg.ses.accessKeyId) && !isPlaceholder(cfg.ses.secretAccessKey)) out.push('ses');
  return out;
}

async function viaResend(cfg: NonNullable<EmailConfig['resend']>, msg: EmailMessage, env: Envelope): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey!.trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.from, to: [msg.to], subject: msg.subject, html: msg.html, text: env.text, headers: env.headers }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

let smtpTransport: nodemailer.Transporter | null = null;
let smtpKey = '';
async function viaSmtp(cfg: NonNullable<EmailConfig['smtp']>, msg: EmailMessage, env: Envelope): Promise<void> {
  const key = `${cfg.host}:${cfg.port}:${cfg.user}`;
  if (!smtpTransport || smtpKey !== key) {
    smtpTransport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
      socketTimeout: TIMEOUT_MS,
    });
    smtpKey = key;
  }
  await smtpTransport.sendMail({ from: env.from, to: msg.to, subject: msg.subject, html: msg.html, text: env.text, headers: env.headers });
}

let sesClient: SESClient | null = null;
async function viaSes(cfg: NonNullable<EmailConfig['ses']>, msg: EmailMessage, env: Envelope): Promise<void> {
  sesClient ??= new SESClient({
    region: cfg.region,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
  await sesClient.send(
    new SendEmailCommand({
      Source: env.from,
      Destination: { ToAddresses: [msg.to] },
      Message: {
        Subject: { Data: msg.subject, Charset: 'UTF-8' },
        Body: { Html: { Data: msg.html, Charset: 'UTF-8' }, Text: { Data: env.text, Charset: 'UTF-8' } },
      },
    }),
    { abortSignal: AbortSignal.timeout(TIMEOUT_MS) }
  );
}

/** The env keys both the API and the worker read; one mapping so they can't drift. */
export interface EmailEnv {
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL: string;
  SMTP_HOST?: string;
  SMTP_PORT: number;
  SMTP_SECURE: boolean;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_FROM_EMAIL?: string;
  AWS_REGION: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_SES_FROM_EMAIL: string;
  EMAIL_FROM_NAME?: string;
  APP_URL?: string;
}

export function emailConfigFromEnv(env: EmailEnv): EmailConfig {
  return {
    fromName: env.EMAIL_FROM_NAME ?? 'VR Cricket League by Pixel Paddle',
    unsubscribeUrl: env.APP_URL ? `${env.APP_URL.replace(/\/$/, '')}/profile` : undefined,
    resend: { apiKey: env.RESEND_API_KEY, from: env.RESEND_FROM_EMAIL },
    smtp: {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      from: env.SMTP_FROM_EMAIL ?? env.SMTP_USER ?? '',
    },
    ses: {
      region: env.AWS_REGION,
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      from: env.AWS_SES_FROM_EMAIL,
    },
  };
}

/** Tries each configured provider in order; the first that accepts the message wins. */
export async function sendEmailWithFallback(cfg: EmailConfig, msg: EmailMessage): Promise<EmailResult> {
  const failures: string[] = [];
  for (const provider of configuredEmailProviders(cfg)) {
    try {
      if (provider === 'resend') await viaResend(cfg.resend!, msg, envelope(cfg, cfg.resend!.from, msg));
      if (provider === 'smtp') await viaSmtp(cfg.smtp!, msg, envelope(cfg, cfg.smtp!.from, msg));
      if (provider === 'ses') await viaSes(cfg.ses!, msg, envelope(cfg, cfg.ses!.from, msg));
      return { sent: true, provider, failures };
    } catch (err) {
      failures.push(`${provider}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (failures.length === 0) failures.push('no email provider is configured');
  return { sent: false, provider: null, failures };
}

export * from './email-templates.js';
