import type { Server } from 'socket.io';
import type { Redis } from 'ioredis';
import { SOCKET_EMIT_CHANNEL } from '../lib/queue-keys.js';

interface SocketEmitMessage {
  userId?: string;
  broadcast?: boolean;
  event: string;
  data: unknown;
}

export function subscribeSocketBridge(subscriber: Redis, io: Server) {
  subscriber.subscribe(SOCKET_EMIT_CHANNEL);
  subscriber.on('message', (channel: string, message: string) => {
    if (channel !== SOCKET_EMIT_CHANNEL) return;
    try {
      const parsed = JSON.parse(message) as SocketEmitMessage;
      if (parsed.broadcast) {
        io.emit(parsed.event, parsed.data);
      } else if (parsed.userId) {
        io.to(`user:${parsed.userId}`).emit(parsed.event, parsed.data);
      }
    } catch (err) {
      console.error('Socket bridge parse error:', err);
    }
  });
}
