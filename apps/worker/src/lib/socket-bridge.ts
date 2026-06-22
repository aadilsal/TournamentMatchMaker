import type { Redis } from 'ioredis';
import { SOCKET_EMIT_CHANNEL } from './queue-keys.js';

export interface SocketEmitMessage {
  userId?: string;
  broadcast?: boolean;
  event: string;
  data: unknown;
}

export async function emitToUser(redis: Redis, userId: string, event: string, data: unknown) {
  const message: SocketEmitMessage = { userId, event, data };
  await redis.publish(SOCKET_EMIT_CHANNEL, JSON.stringify(message));
}

export async function emitBroadcast(redis: Redis, event: string, data: unknown) {
  const message: SocketEmitMessage = { broadcast: true, event, data };
  await redis.publish(SOCKET_EMIT_CHANNEL, JSON.stringify(message));
}
