import type { RedisClient } from './redis.js';

/**
 * Access tokens carry the user's role and are valid until they expire, so a
 * demotion, suspension or "sign this account out" is invisible to every token
 * already in the wild. Blacklisting by `jti` only covers the one token the
 * caller happens to be holding — an admin revoking a rogue session has no way
 * to name the others.
 *
 * Instead we record the moment a user's privileges last changed. Any access
 * token issued at or before that moment is refused, whatever its `jti`.
 */
const KEY = (userId: string) => `jwt:revoked-before:${userId}`;

/** Longer than the longest access-token lifetime; older tokens expire anyway. */
const TTL_SECONDS = 24 * 60 * 60;

export async function revokeUserTokens(redis: RedisClient, userId: string): Promise<void> {
  // Seconds, matching the `iat` claim. Tokens minted in this same second are
  // also refused: issuing and revoking within one second is ambiguous, and
  // erring towards revocation is the safe direction.
  const now = Math.floor(Date.now() / 1000);
  await redis.setex(KEY(userId), TTL_SECONDS, String(now));
}

export async function isTokenRevoked(
  redis: RedisClient,
  userId: string,
  issuedAt: number | undefined
): Promise<boolean> {
  const marker = await redis.get(KEY(userId));
  if (!marker) return false;
  // A token with no `iat` cannot be placed relative to the marker, so treat it
  // as suspect rather than trusted.
  if (issuedAt === undefined) return true;
  return issuedAt <= Number(marker);
}
