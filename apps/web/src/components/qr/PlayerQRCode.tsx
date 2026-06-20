import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import { Download, Printer } from 'lucide-react';
import {
  buildPlayerQRPayload,
  downloadPlayerQR,
  printPlayerQR,
} from '@/lib/player-qr';

interface PlayerQRCodeProps {
  userId: string;
  username: string;
  avatarUrl?: string | null;
}

export function PlayerQRCode({ userId, username, avatarUrl }: PlayerQRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<'print' | 'download' | null>(null);

  const payload = buildPlayerQRPayload(userId, username);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, payload, {
      width: 180,
      margin: 2,
      color: { dark: '#1a1a2e', light: '#ffffff' },
    })
      .then(() => setQrDataUrl(canvasRef.current?.toDataURL('image/png') ?? null))
      .catch(console.error);
  }, [payload]);

  const handlePrint = async () => {
    if (!qrDataUrl) return;
    setBusy('print');
    try {
      printPlayerQR(username, qrDataUrl, avatarUrl);
    } finally {
      setBusy(null);
    }
  };

  const handleDownload = async () => {
    setBusy('download');
    try {
      await downloadPlayerQR(userId, username);
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 flex flex-col items-center gap-4">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-20 w-20 rounded-full object-cover border-2 border-[var(--color-primary)]/30" />
      ) : (
        <div className="h-20 w-20 rounded-full bg-[var(--color-primary)]/15 flex items-center justify-center text-2xl font-bold text-[var(--color-primary)]">
          {username.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="text-center">
        <p className="font-semibold text-lg">{username}</p>
        <p className="text-xs text-[var(--color-muted-foreground)] mt-1">
          Show at venue for Meta ID setup
        </p>
      </div>
      <canvas ref={canvasRef} className="rounded-lg" />
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handlePrint}
          disabled={!qrDataUrl || busy !== null}
          className="gap-2"
        >
          <Printer className="h-4 w-4" />
          {busy === 'print' ? 'Preparing…' : 'Print card'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleDownload}
          disabled={busy !== null}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          {busy === 'download' ? 'Downloading…' : 'Download'}
        </Button>
      </div>
    </div>
  );
}
