import type { RequestHandler } from 'express';
import type { Env } from '../config/env.js';
import { AppError } from '../lib/response.js';

/**
 * Compares a presented credential against a configured one.
 *
 * `META_SSH_PUBLIC_KEY` is optional in the env schema, so it can legitimately be
 * `undefined` — and a bare `presented === configured` then made a request with
 * *no* header authenticate as `undefined === undefined`. An unset credential
 * must never be satisfiable, least of all by sending nothing.
 */
function credentialMatches(presented: string | undefined, configured: string | undefined): boolean {
  if (!configured || !presented) return false;
  return presented === configured;
}

export function metaApiKey(env: Env): RequestHandler {
  return (req, _res, next) => {
    const sharedApiKey = req.headers['x-meta-api-key'] as string | undefined;
    const sshPublicKey = req.headers['x-meta-ssh-public-key'] as string | undefined;

    const isValidSharedApiKey = credentialMatches(sharedApiKey, env.META_API_KEY);
    const isValidSshPublicKey = credentialMatches(sshPublicKey, env.META_SSH_PUBLIC_KEY);

    if (!isValidSharedApiKey && !isValidSshPublicKey) {
      return next(new AppError('UNAUTHORIZED', 'Invalid Meta API key or SSH public key', 401));
    }

    next();
  };
}
