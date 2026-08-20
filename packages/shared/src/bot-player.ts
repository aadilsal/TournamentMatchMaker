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

/**
 * Bat six balls.
 *
 * Deliberately ignorant of the target it is chasing or setting: the bot plays
 * its own innings, so a player can beat it comfortably or fall short, exactly
 * as against a human. Rigging it to the opponent's score is what would make it
 * read as a bot.
 */
export function generateBotScore(random: RandomSource = Math.random): number {
  let total = 0;
  for (let ball = 0; ball < BALLS_PER_INNINGS; ball++) {
    total += rollDelivery(random);
  }
  return Math.max(BOT_MIN_SCORE, total);
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
