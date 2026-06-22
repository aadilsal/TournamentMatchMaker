import type { RequestHandler } from 'express';
import type { Env } from '../config/env.js';
import { AppError } from '../lib/response.js';

export function metaApiKey(env: Env): RequestHandler {
  return (req, _res, next) => {
    const key = req.headers['x-meta-api-key'] as string | undefined;
    if (!key || key !== env.META_API_KEY) {
      return next(new AppError('UNAUTHORIZED', 'Invalid Meta API key', 401));
    }
    next();
  };
}
