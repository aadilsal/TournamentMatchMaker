import type { Server, Socket } from 'socket.io';
import type { Pool } from 'pg';
import type { RedisClient } from '../lib/redis.js';
import type { Env } from '../config/env.js';
import type { AuthPayload } from '../middleware/auth.js';
import { MatchesService } from '../modules/matches/matches.service.js';
import { isSessionValid } from './auth.middleware.js';

/** How often an idle socket re-checks that its session is still valid. */
const SESSION_RECHECK_MS = 30_000;

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

    const endSession = (reason: string) => {
      socket.emit('session:revoked', { reason });
      socket.disconnect(true);
    };

    /**
     * The connection outlives the token, so every action re-checks the session.
     * Without this, a socket opened before logout kept confirming and declining
     * matches long after REST had started refusing the very same token.
     */
    const guard = async (): Promise<boolean> => {
      if (await isSessionValid(env, user)) return true;
      endSession('Session is no longer valid — sign in again');
      return false;
    };

    // Catches revocation while the client sits idle, so a logged-out tab stops
    // receiving live updates instead of waiting for its next action.
    const recheck = setInterval(() => {
      void guard();
    }, SESSION_RECHECK_MS);
    socket.on('disconnect', () => clearInterval(recheck));

    socket.on('match:confirmed', async (data: { matchId: string }) => {
      if (!(await guard())) return;
      try {
        await matchesService.confirm(data.matchId, user.sub);
      } catch (err) {
        socket.emit('error', { message: err instanceof Error ? err.message : 'Confirm failed' });
      }
    });

    socket.on('match:declined', async (data: { matchId: string }) => {
      if (!(await guard())) return;
      try {
        await matchesService.decline(data.matchId, user.sub, { requeue: true });
      } catch (err) {
        socket.emit('error', { message: err instanceof Error ? err.message : 'Decline failed' });
      }
    });
  });
}
