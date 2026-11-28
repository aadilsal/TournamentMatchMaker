import type { Pool } from 'pg';
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_BY_CODE,
  earnedAchievementCodes,
  resolveDisplayTitle,
  type AchievementStats,
  type PlayerAchievements,
} from '@vr-tournament/shared';
import type { Env } from '../config/env.js';
import { enqueueNotification } from './bullmq.js';
import { AppError } from './response.js';

/** Career numbers for every title and badge rule. */
export async function achievementStats(pool: Pool, userId: string): Promise<AchievementStats> {
  const [decided, innings, joined, user, buybacks] = await Promise.all([
    pool.query(
      `SELECT (m.result->>'winnerId')::uuid = $1 AS won, m.result->>'roundLabel' AS round_label,
              m.tournament_id, m.round_number,
              mine.wickets_lost AS my_wickets, mine.played_at AS my_at,
              theirs.score AS their_score, theirs.played_at AS their_at
       FROM matches m
       LEFT JOIN match_innings mine ON mine.match_id = m.id AND mine.user_id = $1
       LEFT JOIN match_innings theirs ON theirs.match_id = m.id AND theirs.user_id <> $1
       WHERE m.status = 'completed' AND m.result->>'winnerId' IS NOT NULL
         AND (m.player1_id = $1 OR m.player2_id = $1)
       ORDER BY m.updated_at`,
      [userId]
    ),
    pool.query(
      `SELECT COALESCE(SUM(score), 0)::int AS runs, COALESCE(SUM(fours), 0)::int AS fours, COALESCE(SUM(sixes), 0)::int AS sixes,
              COALESCE(MAX(score), 0)::int AS best, COALESCE(MAX(sixes), 0)::int AS max_sixes
       FROM match_innings WHERE user_id = $1`,
      [userId]
    ),
    pool.query(
      `SELECT (SELECT COUNT(*)::int FROM tournament_registrations WHERE user_id = $1) AS joined,
              (SELECT COUNT(*)::int FROM tournaments WHERE champion_id = $1) AS titles`,
      [userId]
    ),
    pool.query(`SELECT skill_tier FROM users WHERE id = $1`, [userId]),
    pool.query(`SELECT tournament_id, round_number FROM buybacks WHERE user_id = $1 AND status = 'completed'`, [userId]),
  ]);

  let streak = 0;
  let bestStreak = 0;
  let wins = 0;
  let cleanWins = 0;
  let bigChases = 0;
  let comebackWins = 0;
  for (const r of decided.rows) {
    if (r.won) {
      wins += 1;
      streak += 1;
      bestStreak = Math.max(bestStreak, streak);
      if (r.my_wickets === 0) cleanWins += 1;
      if (r.their_score != null && Number(r.their_score) >= 50 && r.my_at && r.their_at && r.my_at > r.their_at) bigChases += 1;
      if (buybacks.rows.some((b) => b.tournament_id === r.tournament_id && Number(r.round_number) > Number(b.round_number))) comebackWins += 1;
    } else {
      streak = 0;
    }
  }
  const labels = decided.rows.map((r) => r.round_label as string | null);
  const i = innings.rows[0];
  return {
    matches: decided.rows.length,
    wins,
    bestWinStreak: bestStreak,
    runs: Number(i.runs),
    fours: Number(i.fours),
    sixes: Number(i.sixes),
    bestInnings: Number(i.best),
    maxSixesInInnings: Number(i.max_sixes),
    cleanWins,
    bigChases,
    tournamentsJoined: Number(joined.rows[0].joined),
    semiFinals: labels.filter((l) => l === 'Semi-final' || l === 'Final').length,
    finals: labels.filter((l) => l === 'Final').length,
    titles: Number(joined.rows[0].titles),
    comebackWins,
    tier: Number(user.rows[0]?.skill_tier ?? 1),
  };
}

/**
 * Stores newly earned titles and badges and refreshes the shown title.
 * The first sync backfills silently; later unlocks alert the player.
 */
export async function syncAchievements(pool: Pool, userId: string, env?: Env): Promise<string[]> {
  const u = (await pool.query(`SELECT is_bot, title_code, achievements_synced_at FROM users WHERE id = $1`, [userId])).rows[0];
  if (!u || u.is_bot) return [];
  const earned = earnedAchievementCodes(await achievementStats(pool, userId));
  const inserted = earned.length
    ? await pool.query(
        `INSERT INTO user_achievements (user_id, code) SELECT $1, unnest($2::text[])
         ON CONFLICT DO NOTHING RETURNING code`,
        [userId, earned]
      )
    : { rows: [] as Array<{ code: string }> };
  const all = (await pool.query(`SELECT code FROM user_achievements WHERE user_id = $1`, [userId])).rows.map((r) => r.code as string);
  await pool.query(`UPDATE users SET display_title = $2, achievements_synced_at = NOW() WHERE id = $1`, [
    userId,
    resolveDisplayTitle(u.title_code, all),
  ]);

  const fresh = inserted.rows.map((r) => r.code as string);
  if (u.achievements_synced_at && env) {
    for (const code of fresh) {
      const a = ACHIEVEMENT_BY_CODE.get(code);
      if (!a) continue;
      enqueueNotification(env, {
        userId,
        type: 'achievement_unlocked',
        channels: ['in_app'],
        payload: {
          title: a.kind === 'title' ? `New title: ${a.name}` : `Badge unlocked: ${a.name}`,
          message: `${a.description}.${a.kind === 'title' ? ' Show it beside your name from your profile.' : ''}`,
          code,
          kind: a.kind,
          link: '/profile?tab=badges',
        },
        idempotencyKey: `achievement:${userId}:${code}`,
      }).catch((err: unknown) => console.error('Failed to enqueue achievement:', err));
    }
  }
  return fresh;
}

/** Syncs several players without failing the caller. */
export async function syncAchievementsQuietly(pool: Pool, userIds: string[], env?: Env) {
  for (const id of userIds) {
    await syncAchievements(pool, id, env).catch((err: unknown) => console.error('Achievement sync failed:', err));
  }
}

/** Every title and badge with progress and rarity, for a profile. */
export async function playerAchievements(pool: Pool, userId: string): Promise<PlayerAchievements> {
  const user = (await pool.query(`SELECT username, title_code, display_title FROM users WHERE id = $1 AND is_bot = FALSE`, [userId])).rows[0];
  if (!user) throw new AppError('NOT_FOUND', 'Player not found', 404);
  const [stats, mine, counts, players] = await Promise.all([
    achievementStats(pool, userId),
    pool.query(`SELECT code, earned_at FROM user_achievements WHERE user_id = $1`, [userId]),
    pool.query(`SELECT code, COUNT(*)::int AS n FROM user_achievements GROUP BY code`),
    pool.query(`SELECT COUNT(DISTINCT user_id)::int AS n FROM user_achievements`),
  ]);
  const earnedAt = new Map(mine.rows.map((r) => [r.code as string, (r.earned_at as Date).toISOString()]));
  const countOf = new Map(counts.rows.map((r) => [r.code as string, Number(r.n)]));
  const total = Number(players.rows[0]?.n ?? 0);
  const achievements = ACHIEVEMENTS.map(({ metric, ...a }) => ({
    ...a,
    earned: earnedAt.has(a.code),
    earnedAt: earnedAt.get(a.code) ?? null,
    progress: Math.min(stats[metric], a.threshold),
    rarity: total ? Math.round(((countOf.get(a.code) ?? 0) / total) * 100) : null,
  }));
  return {
    username: user.username as string,
    achievements,
    titleCode: (user.title_code as string | null) ?? null,
    displayTitle: (user.display_title as string | null) ?? null,
    earnedCount: earnedAt.size,
    total: ACHIEVEMENTS.length,
  };
}

/** Picks the title shown beside the name; null goes back to "show my best". */
export async function chooseTitle(pool: Pool, userId: string, code: string | null) {
  const earned = (await pool.query(`SELECT code FROM user_achievements WHERE user_id = $1`, [userId])).rows.map((r) => r.code as string);
  if (code && (!earned.includes(code) || ACHIEVEMENT_BY_CODE.get(code)?.kind !== 'title')) {
    throw new AppError('VALIDATION_ERROR', 'You can only show a title you have earned', 400);
  }
  const display = resolveDisplayTitle(code, earned);
  await pool.query(`UPDATE users SET title_code = $2, display_title = $3, updated_at = NOW() WHERE id = $1`, [userId, code, display]);
  return { titleCode: code, displayTitle: display };
}
