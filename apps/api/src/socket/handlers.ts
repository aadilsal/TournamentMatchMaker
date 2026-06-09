import type { Server, Socket } from 'socket.io';
import type { Pool } from 'pg';
import type { RedisClient } from '../lib/redis.js';
import type { Env } from '../config/env.js';
import type { AuthPayload } from '../middleware/auth.js';
import { MatchesService } from '../modules/matches/matches.service.js';

export function registerSocketHandlers(
  io: Server,
  pool: Pool,
  redis: RedisClient,
  env: Env
) {
  const matchesService = new MatchesService(pool, redis, env);

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as AuthPayload;
    socket.join(`user:${user.sub}`);

    socket.on('match:confirmed', async (data: { matchId: string }) => {
      try {
        await matchesService.confirm(data.matchId, user.sub);
      } catch (err) {
        socket.emit('error', { message: err instanceof Error ? err.message : 'Confirm failed' });
      }
    });

    socket.on('match:declined', async (data: { matchId: string }) => {
      try {
        await matchesService.decline(data.matchId, user.sub, { requeue: true });
      } catch (err) {
        socket.emit('error', { message: err instanceof Error ? err.message : 'Decline failed' });
      }
    });
  });
}
