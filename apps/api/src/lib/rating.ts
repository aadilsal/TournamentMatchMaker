import type { PoolClient } from 'pg';
import { applyMatchResult, pointsToTier } from '@vr-tournament/shared';

export async function updateUserRating(
  client: PoolClient,
  userId: string,
  won: boolean
): Promise<{ ratingPoints: number; skillTier: number }> {
  const result = await client.query(
    `SELECT rating_points FROM users WHERE id = $1 FOR UPDATE`,
    [userId]
  );
  const row = result.rows[0];
  if (!row) throw new Error(`User ${userId} not found`);

  const newPoints = applyMatchResult(row.rating_points, won);
  const newTier = pointsToTier(newPoints);

  await client.query(
    `UPDATE users SET rating_points = $1, skill_tier = $2, updated_at = NOW() WHERE id = $3`,
    [newPoints, newTier, userId]
  );

  return { ratingPoints: newPoints, skillTier: newTier };
}
