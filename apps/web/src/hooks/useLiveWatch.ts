import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { LiveBallEvent, LiveInningsEvent } from '@vr-tournament/shared';
import { API_URL } from '@/lib/config';

let liveSocket: Socket | null = null;

/** One shared anonymous connection to the public `/live` namespace. */
function getLiveSocket(): Socket {
  if (!liveSocket) liveSocket = io(`${API_URL}/live`, { transports: ['websocket', 'polling'] });
  return liveSocket;
}

type Handlers = { onBall?: (e: LiveBallEvent) => void; onInnings?: (e: LiveInningsEvent) => void };

/** Watches a match or a whole tournament ball by ball; no login needed. */
export function useLiveWatch(kind: 'match' | 'tournament', id: string | undefined, handlers: Handlers, enabled = true) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!id || !enabled) return;
    const s = getLiveSocket();
    const watch = () => s.emit('watch', { kind, id });
    const onBall = (e: LiveBallEvent) => ref.current.onBall?.(e);
    const onInnings = (e: LiveInningsEvent) => ref.current.onInnings?.(e);
    watch();
    s.on('connect', watch);
    s.on('live:ball', onBall);
    s.on('live:innings', onInnings);
    return () => {
      s.emit('unwatch', { kind, id });
      s.off('connect', watch);
      s.off('live:ball', onBall);
      s.off('live:innings', onInnings);
    };
  }, [kind, id, enabled]);
}
