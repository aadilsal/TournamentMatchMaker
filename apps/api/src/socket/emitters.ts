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

export function emitBroadcast(event: string, data: unknown) {
  if (!ioInstance) return;
  ioInstance.emit(event, data);
}
