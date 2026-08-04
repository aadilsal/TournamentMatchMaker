import type { Server } from 'socket.io';

let ioInstance: Server | null = null;

export function setIo(io: Server) {
  ioInstance = io;
}

export function getIo(): Server | null {
  return ioInstance;
}

export function emitToUser(userId: string, event: string, data: unknown) {
  if (!ioInstance) return;
  ioInstance.to(`user:${userId}`).emit(event, data);
}

/**
 * Drop every live socket belonging to a user whose session just ended.
 * The per-socket re-check would catch this within 30s anyway; this makes it
 * immediate for the common case. With several API instances only the local
 * one is dropped here — the others fall back to their own re-check.
 */
export function disconnectUser(userId: string, reason = 'Session ended') {
  if (!ioInstance) return;
  ioInstance.in(`user:${userId}`).emit('session:revoked', { reason });
  ioInstance.in(`user:${userId}`).disconnectSockets(true);
}

export function emitBroadcast(event: string, data: unknown) {
  if (!ioInstance) return;
  ioInstance.emit(event, data);
}
