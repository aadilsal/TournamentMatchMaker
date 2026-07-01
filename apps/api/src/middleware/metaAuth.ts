import type { RequestHandler } from 'express';
import type { Env } from '../config/env.js';
import { AppError } from '../lib/response.js';

export function metaApiKey(env: Env): RequestHandler {
  return (req, _res, next) => {
    const sharedApiKey = req.headers['x-meta-api-key'] as string | undefined;
    const sshPublicKey = req.headers['x-meta-ssh-public-key'] as string | undefined;

    const isValidSharedApiKey = sharedApiKey === env.META_API_KEY;
    const isValidSshPublicKey = sshPublicKey === env.META_SSH_PUBLIC_KEY;

    if (!isValidSharedApiKey && !isValidSshPublicKey) {
      return next(new AppError('UNAUTHORIZED', 'Invalid Meta API key or SSH public key', 401));
    }

    next();
  };
}
