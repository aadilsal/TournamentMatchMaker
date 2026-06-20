import QRCode from 'qrcode';

const QR_OPTIONS = {
  width: 400,
  margin: 2,
  color: { dark: '#1a1a2e', light: '#ffffff' },
} as const;

export function buildPlayerQRPayload(userId: string, username: string): string {
  return JSON.stringify({ userId, username });
}

export async function generatePlayerQRDataUrl(userId: string, username: string): Promise<string> {
  return QRCode.toDataURL(buildPlayerQRPayload(userId, username), QR_OPTIONS);
}

export async function downloadPlayerQR(userId: string, username: string): Promise<void> {
  const dataUrl = await generatePlayerQRDataUrl(userId, username);
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `${username}-venue-qr.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function printPlayerQR(
  username: string,
  dataUrl: string,
  avatarUrl?: string | null
): void {
  const win = window.open('', '_blank');
  if (!win) return;

  const safeUsername = username.replace(/[<>&"]/g, '');

  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>QR — ${safeUsername}</title>
  <style>
    body { font-family: sans-serif; text-align: center; padding: 24px; }
    .avatar { border-radius: 50%; width: 80px; height: 80px; object-fit: cover; }
    .qr { margin-top: 16px; }
    h2 { margin: 12px 0 4px; }
    p { color: #555; }
  </style>
</head>
<body>
  ${avatarUrl ? `<img class="avatar" src="${avatarUrl}" alt="" />` : ''}
  <h2>${safeUsername}</h2>
  <p>Show this QR to venue staff</p>
  <img class="qr" src="${dataUrl}" width="240" height="240" alt="Player QR code" />
</body>
</html>`);
  win.document.close();

  const printWhenReady = () => {
    win.focus();
    win.print();
  };

  const qrImg = win.document.querySelector('img.qr') as HTMLImageElement | null;
  if (!qrImg || qrImg.complete) {
    printWhenReady();
    return;
  }

  qrImg.onload = printWhenReady;
  qrImg.onerror = printWhenReady;
}
