import { normalizeOvers } from './overs.js';

/**
 * The bot opponent.
 *
 * An odd field leaves one player with nobody to play. A bye hands them a free
 * pass they did not earn; making them wait hands them nothing at all. So they
 * get an opponent instead — one that bats a believable six balls, can win, and
 * carries an ordinary username so the match reads like any other.
 *
 * It is strictly a last resort. Pairing prefers a real opponent every time, and
 * the fallback only fires once the round is close enough to its end that
 * waiting can no longer produce a human. See `BOT_FALLBACK_WINDOW_MS`.
 */

/** Injectable so tests can pin the innings; defaults to `Math.random`. */
export type RandomSource = () => number;

/**
 * How close to the end of a player's play window the bot becomes available.
 *
 * Long enough that the player still has room to bat their six balls after being
 * paired, short enough that we have spent almost the whole round trying to find
 * them a human first. Measured against whichever ends sooner — the round or the
 * player's own slot — because a match that outlives either is unplayable.
 */
export const BOT_FALLBACK_WINDOW_MS = 15 * 60 * 1000;

/**
 * A player must have been waiting at least this long before a bot is considered
 * at all, so a late arrival who lands inside the window above is not handed a
 * bot the moment they queue while a real opponent is still one join away.
 */
export const BOT_MIN_WAIT_MS = 5 * 60 * 1000;

/**
 * One delivery, as runs off the bat.
 *
 * Weighted to read like a real six-ball over rather than a uniform roll: dots
 * and singles dominate, boundaries are the exception. Expected value is ~2.2 a
 * ball, so a typical innings lands in the low-to-mid teens — the 10-to-20 range
 * a human puts up — while leaving both a cheap innings and a big one possible.
 */
const DELIVERY_OUTCOMES: ReadonlyArray<{ runs: number; weight: number }> = [
  { runs: 0, weight: 20 },
  { runs: 1, weight: 25 },
  { runs: 2, weight: 20 },
  { runs: 3, weight: 5 },
  { runs: 4, weight: 20 },
  { runs: 6, weight: 10 },
];

const TOTAL_WEIGHT = DELIVERY_OUTCOMES.reduce((sum, o) => sum + o.weight, 0);

/** Balls in one over; a bot bats this many per over of the tournament. */
export const BALLS_PER_INNINGS = 6;

/**
 * The floor on a bot innings.
 *
 * Six dots is a legal over, but as an opponent it is not a contest — the player
 * wins by pushing a single. Anything below this is played up to it so every bot
 * match is worth batting.
 */
export const BOT_MIN_SCORE = 5;

function rollDelivery(random: RandomSource): number {
  let roll = random() * TOTAL_WEIGHT;
  for (const outcome of DELIVERY_OUTCOMES) {
    roll -= outcome.weight;
    if (roll < 0) return outcome.runs;
  }
  return DELIVERY_OUTCOMES[DELIVERY_OUTCOMES.length - 1].runs;
}

/** Bat a full innings (six balls per over) with no context; the fallback when nothing is known about the player. */
export function generateBotScore(random: RandomSource = Math.random, overs = 1): number {
  const n = normalizeOvers(overs);
  let total = 0;
  for (let ball = 0; ball < n * BALLS_PER_INNINGS; ball++) {
    total += rollDelivery(random);
  }
  return Math.max(BOT_MIN_SCORE * n, total);
}

/** Share of chases the bot wins against a human's completed innings. */
export const BOT_CHASE_WIN_RATE = 0.4;

/** How many of the player's latest innings shape a target the bot sets. */
export const BOT_RECENT_INNINGS = 5;

/** Runs past the target on a winning chase (a last-ball boundary overshoots). */
const CHASE_OVERSHOOT: ReadonlyArray<{ runs: number; weight: number }> = [
  { runs: 0, weight: 45 },
  { runs: 1, weight: 25 },
  { runs: 2, weight: 15 },
  { runs: 3, weight: 10 },
  { runs: 5, weight: 5 },
];

export interface BotInningsContext {
  /** The human's innings in this match, when they batted first. */
  opponentScore?: number | null;
  /** The human's recent innings, newest first, already scaled to this match's overs. */
  recentScores?: readonly number[];
  /** Overs per innings in this match; 1 when omitted. */
  overs?: number;
}

function pickWeighted(options: ReadonlyArray<{ runs: number; weight: number }>, random: RandomSource): number {
  const total = options.reduce((sum, o) => sum + o.weight, 0);
  let roll = random() * total;
  for (const option of options) {
    roll -= option.weight;
    if (roll < 0) return option.runs;
  }
  return options[options.length - 1].runs;
}

/** Chase a known score: finish just past it or just short of it, never level. */
export function botChaseScore(opponentScore: number, random: RandomSource = Math.random): number {
  const target = Math.max(0, Math.round(opponentScore));
  const wins = target === 0 || random() < BOT_CHASE_WIN_RATE;
  if (wins) return target + 1 + pickWeighted(CHASE_OVERSHOOT, random);

  // Close defeats are likelier than heavy ones; the spread grows with the target.
  const spread = Math.max(2, Math.round(target * 0.25));
  const margin = 1 + Math.floor(Math.pow(random(), 1.6) * spread);
  return Math.max(0, target - margin);
}

/** Set a target near the player's recent form (±20%), or bat a full innings when there is none. */
export function botTargetScore(recentScores: readonly number[], random: RandomSource = Math.random, overs = 1): number {
  const recent = recentScores.slice(0, BOT_RECENT_INNINGS).filter((s) => Number.isFinite(s) && s >= 0);
  if (recent.length === 0) return generateBotScore(random, overs);
  const average = recent.reduce((a, b) => a + b, 0) / recent.length;
  return Math.max(BOT_MIN_SCORE * normalizeOvers(overs), Math.round(average * (0.8 + random() * 0.4)));
}

/** The bot's innings, shaped by what the human has already done. */
export function generateBotInnings(context: BotInningsContext = {}, random: RandomSource = Math.random): number {
  if (context.opponentScore != null) return botChaseScore(context.opponentScore, random);
  return botTargetScore(context.recentScores ?? [], random, context.overs ?? 1);
}

/**
 * Usernames a bot can take.
 *
 * Ordinary handles, in the style players pick themselves — nothing that hints
 * at what they are. One is claimed per tournament and never reused while it is
 * held, so a player never meets the same name twice.
 */
const BOT_USERNAME_POOL: readonly string[] = [
  'ravi_mehta', 'jordan_blake', 'sam_okafor', 'liam_whitfield', 'noah_bergman',
  'aryan_kapoor', 'chris_donnelly', 'tom_ashworth', 'zane_carter', 'omar_haddad',
  'dev_narang', 'jake_hollis', 'ethan_marsh', 'kabir_sethi', 'luca_ferretti',
  'max_thornton', 'arjun_bedi', 'callum_reeves', 'nate_sullivan', 'rohit_vaswani',
  'felix_moreau', 'adam_kowalski', 'ryan_delgado', 'vikram_anand', 'jonas_lindqvist',
  'harry_prescott', 'imran_qureshi', 'oscar_bennett', 'nikhil_rao', 'theo_vandermeer',
];

/**
 * Pick a username for a new bot, avoiding everything already taken.
 *
 * `taken` must carry every existing username, not just the bots' — a bot
 * colliding with a real player's handle would fail the unique index, and the
 * odd player out would silently get no opponent at all.
 *
 * Falls back to a numbered variant once the pool is exhausted, so a long-lived
 * deployment never runs out of names.
 */
export function pickBotUsername(
  taken: ReadonlySet<string>,
  random: RandomSource = Math.random
): string {
  const free = BOT_USERNAME_POOL.filter((name) => !taken.has(name));
  if (free.length > 0) {
    return free[Math.floor(random() * free.length) % free.length];
  }

  for (let suffix = 2; ; suffix++) {
    for (const name of BOT_USERNAME_POOL) {
      const candidate = `${name}${suffix}`;
      if (!taken.has(candidate)) return candidate;
    }
  }
}

/** Bots are not accounts — nothing may ever authenticate as one. */
export const BOT_PASSWORD_HASH = '!bot-no-login';

export function botEmailFor(tournamentId: string): string {
  return `bot+${tournamentId}@bots.invalid`;
}
