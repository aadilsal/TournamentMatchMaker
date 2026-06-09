import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@vr-tournament/shared';
import { getAccessToken } from '@/lib/api';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let sharedSocket: AppSocket | null = null;

function getOrCreateSocket(): AppSocket | null {
  const token = getAccessToken();
  if (!token) return null;
  if (!sharedSocket) {
    sharedSocket = io(API_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
  }
  return sharedSocket;
}

export function useSocket(enabled = true) {
  const [socket, setSocket] = useState<AppSocket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const s = getOrCreateSocket();
    if (!s) return;
    setSocket(s);

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    if (s.connected) setConnected(true);

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
    };
  }, [enabled]);

  return { socket, connected };
}

export function useSocketEvent<E extends keyof ServerToClientEvents>(
  event: E,
  handler: ServerToClientEvents[E],
  enabled = true
) {
  const { socket } = useSocket(enabled);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!socket || !enabled) return;
    const listener = ((...args: unknown[]) => {
      (handlerRef.current as (...a: unknown[]) => void)(...args);
    }) as (...args: unknown[]) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (socket as any).on(event, listener);
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (socket as any).off(event, listener);
    };
  }, [socket, event, enabled]);
}
