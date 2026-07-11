import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { RefreshCw, Headset } from 'lucide-react';
import { useState, useEffect } from 'react';

interface LinkCodeData {
  code: string;
  expiresInSeconds: number;
}

export function MetaLinkCodeDisplay() {
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['meta-link-code'],
    queryFn: () => apiGet<LinkCodeData>('/integrations/meta/link-code'),
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (data?.expiresInSeconds) {
      setTimeLeft(data.expiresInSeconds);
      const timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [data]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 flex flex-col items-center gap-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-primary)]/15">
        <Headset className="h-8 w-8 text-[var(--color-primary)]" />
      </div>
      <div className="text-center">
        <p className="font-semibold text-lg">Link Meta Quest</p>
        <p className="text-xs text-[var(--color-muted-foreground)] mt-1">
          Enter this 4-digit code in the VR game to link your account.
        </p>
      </div>

      <div className="relative mt-2">
        {isLoading || isFetching ? (
          <div className="h-20 w-48 animate-pulse rounded-xl bg-[var(--color-muted)]" />
        ) : isError ? (
          <div className="flex h-20 w-48 flex-col items-center justify-center rounded-xl border border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 text-[var(--color-destructive)]">
            <p className="text-sm font-semibold">Error loading code</p>
          </div>
        ) : (
          <div className="flex h-20 w-48 items-center justify-center rounded-xl bg-[var(--color-muted)]/50 tracking-[0.5em] text-4xl font-mono font-bold">
            {data?.code}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 mt-2">
        <p className="text-sm text-[var(--color-muted-foreground)]">
          {timeLeft !== null && timeLeft > 0 ? (
            <>Expires in <span className="font-mono font-semibold">{formatTime(timeLeft)}</span></>
          ) : (
            <span className="text-[var(--color-destructive)]">Code expired</span>
          )}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>
    </div>
  );
}
