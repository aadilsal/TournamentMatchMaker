import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import type { Env } from '../config/env.js';

let sesClient: SESClient | null = null;

function getSesClient(env: Env): SESClient {
  if (!sesClient) {
    sesClient = new SESClient({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return sesClient;
}

/**
 * Sends a transactional email via AWS SES.
 *
 * In development (or when AWS credentials are still the sample placeholders) the
 * email is logged to the console instead of hitting SES, so local integration
 * testing does not require real credentials.
 */
export async function sendEmail(
  env: Env,
  to: string,
  subject: string,
  html: string
): Promise<boolean> {
  if (!env.NOTIFICATION_EMAIL_ENABLED) return true;

  const isSampleKey =
    env.AWS_ACCESS_KEY_ID.startsWith('sample') || env.AWS_SECRET_ACCESS_KEY.startsWith('sample');

  if (isSampleKey) {
    console.log(`[email:dev] To: ${to} | Subject: ${subject}\n${html}`);
    return true;
  }

  await getSesClient(env).send(
    new SendEmailCommand({
      Source: env.AWS_SES_FROM_EMAIL,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: { Html: { Data: html, Charset: 'UTF-8' } },
      },
    })
  );
  return true;
}
