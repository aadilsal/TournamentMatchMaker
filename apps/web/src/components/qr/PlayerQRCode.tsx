import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';

interface PlayerQRCodeProps {
  userId: string;
  username: string;
  avatarUrl?: string | null;
}

export function PlayerQRCode({ userId, username, avatarUrl }: PlayerQRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const payload = JSON.stringify({ userId, username });

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, payload, {
      width: 180,
      margin: 2,
      color: { dark: '#1a1a2e', light: '#ffffff' },
    }).catch(console.error);
  }, [payload]);

  const handlePrint = () => {
    if (!cardRef.current) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html><head><title>QR — ${username}</title>
      <style>body{font-family:sans-serif;text-align:center;padding:24px}
      img{border-radius:50%;width:80px;height:80px;object-fit:cover}
      h2{margin:12px 0 4px}</style></head><body>
      ${avatarUrl ? `<img src="${avatarUrl}" alt="" />` : ''}
      <h2>${username}</h2>
      <p>Show this QR to venue staff</p>
      ${canvasRef.current?.outerHTML ?? ''}
      </body></html>`);
    win.document.close();
    win.print();
  };

  return (
    <div ref={cardRef} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 flex flex-col items-center gap-4">
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
      <Button type="button" variant="outline" size="sm" onClick={handlePrint} className="gap-2">
        <Printer className="h-4 w-4" />
        Print card
      </Button>
    </div>
  );
}
