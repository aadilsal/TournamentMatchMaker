/** Titles (from career 4s and 6s) and badges (checkpoints), shared by API and web. */

export type AchievementKind = 'title' | 'badge';
export type AchievementCategory = 'titles' | 'firsts' | 'milestones' | 'feats' | 'streaks' | 'tournament' | 'tier';
export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'legend';
export type AchievementIcon =
  | 'six' | 'four' | 'bat' | 'trophy' | 'crown' | 'flame' | 'zap' | 'target' | 'shield'
  | 'calendar' | 'swords' | 'rocket' | 'mountain' | 'star' | 'medal';

/** Career numbers every rule reads from. */
export interface AchievementStats {
  matches: number;
  wins: number;
  bestWinStreak: number;
  runs: number;
  fours: number;
  sixes: number;
  bestInnings: number;
  maxSixesInInnings: number;
  /** Wins without losing a wicket. */
  cleanWins: number;
  /** Wins chasing a score of 50 or more. */
  bigChases: number;
  tournamentsJoined: number;
  semiFinals: number;
  finals: number;
  titles: number;
  /** Wins after buying back into a tournament. */
  comebackWins: number;
  tier: number;
}

export interface AchievementDef {
  code: string;
  kind: AchievementKind;
  name: string;
  description: string;
  category: AchievementCategory;
  tier: AchievementTier;
  icon: AchievementIcon;
  metric: keyof AchievementStats;
  threshold: number;
  /** Titles only: higher outranks lower when picking the default. */
  rank?: number;
}

const title = (code: string, name: string, icon: 'six' | 'four', threshold: number, tier: AchievementTier, rank: number): AchievementDef => ({
  code,
  kind: 'title',
  name,
  description: `Hit ${threshold} career ${icon === 'six' ? 'sixes' : 'fours'}`,
  category: 'titles',
  tier,
  icon,
  metric: icon === 'six' ? 'sixes' : 'fours',
  threshold,
  rank,
});

const badge = (
  code: string,
  name: string,
  description: string,
  category: AchievementCategory,
  tier: AchievementTier,
  icon: AchievementIcon,
  metric: keyof AchievementStats,
  threshold: number
): AchievementDef => ({ code, kind: 'badge', name, description, category, tier, icon, metric, threshold });

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  title('six_10', 'Six Hitter', 'six', 10, 'bronze', 2),
  title('six_50', 'Big Hitter', 'six', 50, 'silver', 4),
  title('six_100', 'Six Machine', 'six', 100, 'gold', 6),
  title('six_250', 'Sky Breaker', 'six', 250, 'platinum', 8),
  title('six_500', 'Maximum Legend', 'six', 500, 'legend', 10),
  title('four_25', 'Gap Finder', 'four', 25, 'bronze', 1),
  title('four_100', 'Boundary Hunter', 'four', 100, 'silver', 3),
  title('four_250', 'Boundary King', 'four', 250, 'gold', 5),
  title('four_500', 'Cover Drive Maestro', 'four', 500, 'platinum', 7),

  badge('first_match', 'First Match', 'Play your first match', 'firsts', 'bronze', 'bat', 'matches', 1),
  badge('first_win', 'First Win', 'Win your first match', 'firsts', 'bronze', 'trophy', 'wins', 1),
  badge('first_four', 'First Four', 'Hit your first four', 'firsts', 'bronze', 'four', 'fours', 1),
  badge('first_six', 'First Six', 'Hit your first six', 'firsts', 'bronze', 'six', 'sixes', 1),
  badge('debut', 'Tournament Debut', 'Join your first tournament', 'firsts', 'bronze', 'calendar', 'tournamentsJoined', 1),

  badge('runs_100', 'Run Scorer', 'Score 100 career runs', 'milestones', 'bronze', 'mountain', 'runs', 100),
  badge('runs_500', 'Run Builder', 'Score 500 career runs', 'milestones', 'silver', 'mountain', 'runs', 500),
  badge('runs_1000', 'Run Mountain', 'Score 1,000 career runs', 'milestones', 'gold', 'mountain', 'runs', 1000),
  badge('matches_5', 'Regular', 'Play 5 matches', 'milestones', 'bronze', 'swords', 'matches', 5),
  badge('matches_25', 'Seasoned', 'Play 25 matches', 'milestones', 'silver', 'swords', 'matches', 25),
  badge('matches_100', 'Veteran', 'Play 100 matches', 'milestones', 'gold', 'swords', 'matches', 100),
  badge('wins_3', 'Winner', 'Win 3 matches', 'milestones', 'bronze', 'star', 'wins', 3),
  badge('wins_10', 'Match Winner', 'Win 10 matches', 'milestones', 'silver', 'star', 'wins', 10),
  badge('wins_50', 'Serial Winner', 'Win 50 matches', 'milestones', 'gold', 'star', 'wins', 50),

  badge('half_century', 'Half-Century', 'Score 50 in one innings', 'feats', 'gold', 'bat', 'bestInnings', 50),
  badge('six_shower', 'Six Shower', 'Hit 5 sixes in one innings', 'feats', 'gold', 'six', 'maxSixesInInnings', 5),
  badge('clean_sheet', 'Clean Sheet', 'Win without losing a wicket', 'feats', 'silver', 'shield', 'cleanWins', 1),
  badge('big_chase', 'Big Chase', 'Chase down a score of 50 or more', 'feats', 'silver', 'target', 'bigChases', 1),

  badge('hat_trick', 'Hat-trick', 'Win 3 matches in a row', 'streaks', 'silver', 'flame', 'bestWinStreak', 3),
  badge('unstoppable', 'Unstoppable', 'Win 5 matches in a row', 'streaks', 'gold', 'zap', 'bestWinStreak', 5),

  badge('semi_finalist', 'Semi-finalist', 'Reach a semi-final', 'tournament', 'bronze', 'medal', 'semiFinals', 1),
  badge('finalist', 'Finalist', 'Reach a final', 'tournament', 'silver', 'medal', 'finals', 1),
  badge('champion', 'Champion', 'Win a tournament', 'tournament', 'gold', 'crown', 'titles', 1),
  badge('double_champion', 'Double Champion', 'Win 2 tournaments', 'tournament', 'platinum', 'crown', 'titles', 2),
  badge('comeback', 'Comeback', 'Win a match after buying back in', 'tournament', 'silver', 'rocket', 'comebackWins', 1),

  badge('tier_2', 'Tier 2 Reached', 'Climb to Tier 2', 'tier', 'bronze', 'trophy', 'tier', 2),
  badge('tier_3', 'Tier 3 Reached', 'Climb to Tier 3', 'tier', 'silver', 'trophy', 'tier', 3),
  badge('tier_4', 'Tier 4 Reached', 'Climb to Tier 4', 'tier', 'gold', 'trophy', 'tier', 4),
  badge('tier_5', 'Tier 5 Reached', 'Climb to Tier 5', 'tier', 'platinum', 'trophy', 'tier', 5),
];

export const ACHIEVEMENT_BY_CODE = new Map(ACHIEVEMENTS.map((a) => [a.code, a]));

export const ACHIEVEMENT_CATEGORY_LABELS: Record<AchievementCategory, string> = {
  titles: 'Titles',
  firsts: 'Firsts',
  milestones: 'Milestones',
  feats: 'Innings feats',
  streaks: 'Streaks',
  tournament: 'Tournament',
  tier: 'Tiers',
};

/** Codes the stats have earned. */
export function earnedAchievementCodes(stats: AchievementStats): string[] {
  return ACHIEVEMENTS.filter((a) => stats[a.metric] >= a.threshold).map((a) => a.code);
}

/** The highest-ranked title among the earned codes. */
export function bestTitleCode(earned: Iterable<string>): string | null {
  let best: AchievementDef | null = null;
  for (const code of earned) {
    const a = ACHIEVEMENT_BY_CODE.get(code);
    if (a?.kind === 'title' && (!best || (a.rank ?? 0) > (best.rank ?? 0))) best = a;
  }
  return best?.code ?? null;
}

/** The title shown beside the name: the chosen one if earned, else the best. */
export function resolveDisplayTitle(chosen: string | null | undefined, earned: Iterable<string>): string | null {
  const set = new Set(earned);
  const code = chosen && set.has(chosen) && ACHIEVEMENT_BY_CODE.get(chosen)?.kind === 'title' ? chosen : bestTitleCode(set);
  return code ? (ACHIEVEMENT_BY_CODE.get(code)?.name ?? null) : null;
}

/** One achievement as a player sees it. */
export interface AchievementView extends Omit<AchievementDef, 'metric'> {
  earned: boolean;
  earnedAt: string | null;
  /** Current value toward the threshold, capped at it. */
  progress: number;
  /** Share of active players who have it, 0–100; null when nobody has played yet. */
  rarity: number | null;
}

export interface PlayerAchievements {
  username: string;
  achievements: AchievementView[];
  /** Title the player picked; null means "show my best". */
  titleCode: string | null;
  displayTitle: string | null;
  earnedCount: number;
  total: number;
}
