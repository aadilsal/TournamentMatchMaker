import type { PoolClient } from 'pg';
import { applyMatchResult, tierAfterResult } from '@vr-tournament/shared';

export async function updateUserRating(
  client: PoolClient,
  userId: string,
  won: boolean
): Promise<{ ratingPoints: number; skillTier: number; change: number }> {
  const result = await client.query(
    `SELECT rating_points, skill_tier FROM users WHERE id = $1 FOR UPDATE`,
    [userId]
  );
  const row = result.rows[0];
  if (!row) throw new Error(`User ${userId} not found`);

  const newPoints = applyMatchResult(row.rating_points, won);
  // A reached tier is kept even when a loss takes the points below it.
  const newTier = tierAfterResult(Number(row.skill_tier ?? 1), newPoints);

  await client.query(
    `UPDATE users SET rating_points = $1, skill_tier = $2, updated_at = NOW() WHERE id = $3`,
    [newPoints, newTier, userId]
  );

  return { ratingPoints: newPoints, skillTier: newTier, change: newPoints - Number(row.rating_points) };
}
