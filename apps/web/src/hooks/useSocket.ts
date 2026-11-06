import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@vr-tournament/shared';
import { getAccessToken, refreshSession } from '@/lib/api';
import { API_URL } from '@/lib/config';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// Messages the API's socket auth middleware rejects a handshake with.
const AUTH_ERRORS = ['authentication required', 'session is no longer valid', 'invalid token'];
const MAX_AUTH_RETRIES = 2;

let sharedSocket: AppSocket | null = null;
let authRetries = 0;

function isAuthError(err: Error) {
  const message = err.message.toLowerCase();
  return AUTH_ERRORS.some((m) => message.includes(m));
}

async function refreshAndReconnect(s: AppSocket) {
  if (authRetries >= MAX_AUTH_RETRIES) return;
  authRetries += 1;
  if ((await refreshSession()) && sharedSocket === s && !s.connected) s.connect();
}

function createSocket(): AppSocket {
  const s: AppSocket = io(API_URL, {
    // Read on every (re)connect, so a refreshed token is used without rebuilding the socket.
    auth: (cb) => cb({ token: getAccessToken() }),
    transports: ['websocket', 'polling'],
    autoConnect: false,
  });
  s.on('connect', () => {
    authRetries = 0;
  });
  // A rejected handshake is not retried by socket.io, so refresh and reconnect ourselves.
  s.on('connect_error', (err) => {
    if (isAuthError(err)) void refreshAndReconnect(s);
  });
  s.on('disconnect', (reason) => {
    if (reason === 'io server disconnect') void refreshAndReconnect(s);
  });
  return s;
}

/** Returns the one app-wide socket, connecting it if needed. Listeners on it are never stripped. */
export function connectSocket(): AppSocket | null {
  if (!getAccessToken()) return null;
  if (!sharedSocket) sharedSocket = createSocket();
  if (!sharedSocket.connected && !sharedSocket.active) sharedSocket.connect();
  return sharedSocket;
}

/** Closes the connection on logout; keeps the instance so registered listeners survive a re-login. */
export function disconnectSocket() {
  sharedSocket?.disconnect();
}

export function getSocket(): AppSocket | null {
  return sharedSocket;
}

export function useSocket(enabled = true) {
  const [socket, setSocket] = useState<AppSocket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setSocket(null);
      setConnected(false);
      return;
    }

    const s = connectSocket();
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
