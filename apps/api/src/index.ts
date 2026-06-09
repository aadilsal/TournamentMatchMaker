import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });
import { loadEnv } from './config/env.js';
import { getPool, closePool } from './lib/db.js';
import { getRedis, closeRedis } from './lib/redis.js';
import { createApp } from './app.js';
import { socketAuth } from './socket/auth.middleware.js';
import { registerSocketHandlers } from './socket/handlers.js';
import { setIo } from './socket/emitters.js';
import { subscribeSocketBridge } from './socket/bridge.js';

const env = loadEnv();
const pool = getPool(env.DATABASE_URL);
const redis = getRedis(env.REDIS_URL);
const app = createApp(pool, redis, env);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: env.CORS_ORIGIN, credentials: true },
});

const pubClient = new Redis(env.REDIS_URL);
const subClient = pubClient.duplicate();
const bridgeSub = new Redis(env.REDIS_URL);
io.adapter(createAdapter(pubClient, subClient));

io.use(socketAuth(env));
setIo(io);
registerSocketHandlers(io, pool, redis, env);
subscribeSocketBridge(bridgeSub, io);

httpServer.listen(env.PORT, () => {
  console.log(`API server running on port ${env.PORT} (HTTP + Socket.IO)`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down gracefully`);
  io.close();
  httpServer.close(async () => {
    pubClient.disconnect();
    subClient.disconnect();
    bridgeSub.disconnect();
    await closePool();
    await closeRedis();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
