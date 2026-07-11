export function metaOtpEmailHtml(data: {
  username: string;
  otp: string;
  expiresInMinutes: number;
}): string {
  return `
  <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1a1a2e;">
    <h1 style="font-size: 20px; margin-bottom: 8px;">Verify your Pixel Paddle account</h1>
    <p style="color: #555; margin-top: 0;">Hi ${data.username}, use this code to link your VR headset to your Pixel Paddle account.</p>
    <div style="margin: 24px 0; text-align: center;">
      <span style="display: inline-block; font-size: 34px; font-weight: 700; letter-spacing: 10px; background: #f2f2f7; border-radius: 12px; padding: 16px 24px;">
        ${data.otp}
      </span>
    </div>
    <p style="color: #555;">This code expires in <strong>${data.expiresInMinutes} minutes</strong>. If you did not request it, you can safely ignore this email.</p>
    <p style="color: #999; font-size: 12px; margin-top: 24px;">Never share this code with anyone. Pixel Paddle staff will never ask for it.</p>
  </div>
  `;
}
