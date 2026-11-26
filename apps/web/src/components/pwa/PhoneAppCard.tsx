import { useEffect, useState } from 'react';
import { BellRing, Download, Share, Smartphone } from 'lucide-react';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Install the app on the phone, and turn match alerts on or off for this device. */
export function PhoneAppCard() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [alertsOn, setAlertsOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  useEffect(() => {
    if (!pushSupported()) return;
    apiGet<{ publicKey: string | null }>('/push/public-key').then((r) => setPublicKey(r.publicKey)).catch(() => {});
    navigator.serviceWorker.getRegistration().then(async (reg) => {
      const sub = await reg?.pushManager.getSubscription();
      setAlertsOn(!!sub && Notification.permission === 'granted');
    });
  }, []);

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setInstallEvent(null);
  };

  const toggleAlerts = async () => {
    if (!publicKey) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (alertsOn && existing) {
        await apiDelete(`/push/subscriptions?endpoint=${encodeURIComponent(existing.endpoint)}`);
        await existing.unsubscribe();
        setAlertsOn(false);
        toast.success('Match alerts are off on this phone.');
        return;
      }
      if ((await Notification.requestPermission()) !== 'granted') {
        toast.error('Alerts are blocked. Allow notifications for this site in your phone settings.');
        return;
      }
      const sub =
        existing ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource }));
      await apiPost('/push/subscriptions', sub.toJSON());
      setAlertsOn(true);
      toast.success("Match alerts are on. We'll tell you when it's your turn.");
    } catch {
      toast.error('Could not change match alerts. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const canAlert = pushSupported() && !!publicKey && (!isIos() || installed);
  const showInstall = !installed && (installEvent || isIos());
  if (!canAlert && !showInstall) return null;

  return (
    <section className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Smartphone className="h-4 w-4 text-[var(--color-primary)]" aria-hidden />
        VR Cricket on your phone
      </h2>
      {showInstall &&
        (installEvent ? (
          <Button className="w-full gap-2" onClick={install} tooltip="Add VR Cricket League to your home screen">
            <Download className="h-4 w-4" aria-hidden /> Install the app
          </Button>
        ) : (
          <p className="flex items-start gap-2 text-sm text-[var(--color-muted-foreground)]">
            <Share className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Install it: tap Share, then &ldquo;Add to Home Screen&rdquo;. Match alerts work once it&rsquo;s installed.
          </p>
        ))}
      {canAlert && (
        <Button
          variant={alertsOn ? 'outline' : 'default'}
          className="w-full gap-2"
          disabled={busy}
          onClick={toggleAlerts}
          tooltip={alertsOn ? 'Stop match alerts on this phone' : "Get a notification when it's your turn, a round starts or closes, and when results are in"}
        >
          <BellRing className="h-4 w-4" aria-hidden />
          {busy ? 'Saving…' : alertsOn ? 'Match alerts on · turn off' : 'Get match alerts on this phone'}
        </Button>
      )}
    </section>
  );
}
