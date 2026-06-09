import jwt from 'jsonwebtoken';
import type { Socket } from 'socket.io';
import type { Env } from '../config/env.js';
import type { AuthPayload } from '../middleware/auth.js';

export function socketAuth(env: Env) {
  return (socket: Socket, next: (err?: Error) => void) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthPayload;
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  };
}
