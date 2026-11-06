// Server-only (exported as @vr-tournament/shared/email); never import from the web app.
import nodemailer from 'nodemailer';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

export type EmailProvider = 'resend' | 'smtp' | 'ses';

export interface EmailConfig {
  resend?: { apiKey?: string; from: string };
  smtp?: { host?: string; port: number; secure: boolean; user?: string; pass?: string; from: string };
  ses?: { region: string; accessKeyId: string; secretAccessKey: string; from: string };
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
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

async function viaResend(cfg: NonNullable<EmailConfig['resend']>, msg: EmailMessage): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey!.trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: cfg.from, to: [msg.to], subject: msg.subject, html: msg.html }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

let smtpTransport: nodemailer.Transporter | null = null;
let smtpKey = '';
async function viaSmtp(cfg: NonNullable<EmailConfig['smtp']>, msg: EmailMessage): Promise<void> {
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
  await smtpTransport.sendMail({ from: cfg.from, to: msg.to, subject: msg.subject, html: msg.html });
}

let sesClient: SESClient | null = null;
async function viaSes(cfg: NonNullable<EmailConfig['ses']>, msg: EmailMessage): Promise<void> {
  sesClient ??= new SESClient({
    region: cfg.region,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
  await sesClient.send(
    new SendEmailCommand({
      Source: cfg.from,
      Destination: { ToAddresses: [msg.to] },
      Message: {
        Subject: { Data: msg.subject, Charset: 'UTF-8' },
        Body: { Html: { Data: msg.html, Charset: 'UTF-8' } },
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
}

export function emailConfigFromEnv(env: EmailEnv): EmailConfig {
  return {
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
      if (provider === 'resend') await viaResend(cfg.resend!, msg);
      if (provider === 'smtp') await viaSmtp(cfg.smtp!, msg);
      if (provider === 'ses') await viaSes(cfg.ses!, msg);
      return { sent: true, provider, failures };
    } catch (err) {
      failures.push(`${provider}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (failures.length === 0) failures.push('no email provider is configured');
  return { sent: false, provider: null, failures };
}
