import type { Server, Socket } from 'socket.io';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ROOMS = 10;

/** Public `/live` namespace: anyone may watch matches and tournaments; nothing can be sent. */
export function registerLiveNamespace(io: Server) {
  io.of('/live').on('connection', (socket: Socket) => {
    const room = (kind: unknown, id: unknown) =>
      (kind === 'match' || kind === 'tournament') && typeof id === 'string' && UUID.test(id) ? `${kind}:${id.toLowerCase()}` : null;

    socket.on('watch', (data: { kind?: string; id?: string }) => {
      const r = room(data?.kind, data?.id);
      if (r && socket.rooms.size <= MAX_ROOMS) void socket.join(r);
    });
    socket.on('unwatch', (data: { kind?: string; id?: string }) => {
      const r = room(data?.kind, data?.id);
      if (r) void socket.leave(r);
    });
  });
}
