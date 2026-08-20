import type { Pool, PoolClient } from 'pg';
import type { Redis } from 'ioredis';
import {
  BOT_FALLBACK_WINDOW_MS,
  BOT_MIN_WAIT_MS,
  BOT_PASSWORD_HASH,
  QUEUE_GLOBAL,
  QUEUE_MEMBER,
  botEmailFor,
  initialScoresForChase,
  pickBotUsername,
  queuePlayerKey,
  queueTournamentKey,
} from '@vr-tournament/shared';
import { emitToUser } from './socket-bridge.js';

type NotificationQueue = {
  add: (name: string, data: unknown, opts?: { jobId?: string }) => Promise<unknown>;
};

/**
 * Find or create this tournament's bot, and make it a real participant.
 *
 * The registration and participant rows are not optional bookkeeping: closing a
 * round reads the standings through `tournament_participants JOIN
 * tournament_registrations`, so a bot missing either would be invisible to it —
 * it could win a match and then silently vanish from the field, taking the
 * bracket slot with it. A bot advances or is eliminated on exactly the same
 * terms as a human, so it has to be described the same way.
 */
async function ensureTournamentBot(
  client: PoolClient,
  tournamentId: string,
  roundNumber: number
): Promise<string> {
  const existing = await client.query(
    `SELECT id FROM users WHERE bot_tournament_id = $1`,
    [tournamentId]
  );

  let botId: string | undefined = existing.rows[0]?.id;

  if (!botId) {
    // Every username, not just the bots': a collision with a real player's
    // handle fails the unique index, and the odd player out would end up with
    // no opponent at all.
    const taken = await client.query(`SELECT username FROM users`);
    const username = pickBotUsername(
      new Set(taken.rows.map((r) => r.username as string))
    );

    const created = await client.query(
      `INSERT INTO users (email, password_hash, username, is_bot, bot_tournament_id, has_vr_headset, skill_tier)
       VALUES ($1, $2, $3, TRUE, $4, TRUE, 3)
       RETURNING id`,
      [botEmailFor(tournamentId), BOT_PASSWORD_HASH, username, tournamentId]
    );
    botId = created.rows[0].id as string;
    console.log(`Created bot ${username} (${botId}) for tournament ${tournamentId}`);
  }

  await client.query(
    `INSERT INTO tournament_registrations (tournament_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (tournament_id, user_id) DO NOTHING`,
    [tournamentId, botId]
  );

  // Carried to the round the player it is about to face is in, so the standings
  // read it as part of that round rather than one it never played.
  await client.query(
    `INSERT INTO tournament_participants (tournament_id, user_id, status, round_number)
     VALUES ($1, $2, 'active', $3)
     ON CONFLICT (tournament_id, user_id)
     DO UPDATE SET status = 'active', round_number = $3, updated_at = NOW()
     WHERE tournament_participants.status NOT IN ('active', 'advanced', 'knockout')
        OR tournament_participants.round_number < $3`,
    [tournamentId, botId, roundNumber]
  );

  return botId;
}

/**
 * Whether this player has run out of chances to be given a human opponent.
 *
 * Two conditions, and both have to hold. The deadline test is the point of the
 * feature — a bot is a last resort, so we spend almost the whole round trying
 * to find a real opponent and only fall back once there is just enough time
 * left for the player to bat. The wait test stops a late arrival who happens to
 * queue inside that window from being handed a bot immediately, while a real
 * opponent may still be one join away.
 */
function botFallbackIsDue(joinedAt: number, deadline: number, now: number): boolean {
  const waitedLongEnough = now - joinedAt >= BOT_MIN_WAIT_MS;
  const outOfTime = deadline - now <= BOT_FALLBACK_WINDOW_MS;
  return waitedLongEnough && outOfTime;
}

/**
 * Give a bot opponent to anyone left in the queue with nowhere else to go.
 *
 * Runs only after ordinary pairing has drained — everything a real opponent
 * could have matched is already matched, so whoever is still here is genuinely
 * the odd one out.
 */
export async function pairLeftoversWithBot(
  pool: Pool,
  redis: Redis,
  tournamentId: string,
  queueKey: string,
  notificationQueue: NotificationQueue
): Promise<number> {
  const members = await redis.zrange(queueKey, 0, -1);
  if (members.length === 0) return 0;

  const now = Date.now();
  let paired = 0;

  for (const userId of members) {
    const meta = await redis.hgetall(queuePlayerKey(userId));
    if (!meta.userId) continue;

    const roundNumber = parseInt(meta.roundNumber || '1', 10);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const roundResult = await client.query(
        `SELECT starts_at, ends_at FROM tournament_rounds
         WHERE tournament_id = $1 AND round_number = $2 AND status = 'active'`,
        [tournamentId, roundNumber]
      );
      const round = roundResult.rows[0];
      if (!round) {
        await client.query('ROLLBACK');
        continue;
      }

      // Whichever shuts first. A match that outlives either is unplayable: the
      // round check and the slot check both refuse a score past their end.
      const roundEndsAt = new Date(round.ends_at).getTime();
      const slotEndAt = meta.slotEndAt ? parseInt(meta.slotEndAt, 10) : null;
      const deadline = slotEndAt ? Math.min(roundEndsAt, slotEndAt) : roundEndsAt;
      const joinedAt = parseInt(meta.joinedAt || '0', 10) || now;

      if (!botFallbackIsDue(joinedAt, deadline, now)) {
        await client.query('ROLLBACK');
        continue;
      }

      // The same guard ordinary pairing keeps: the queue and the matches table
      // are separate stores, and a membership can outlive the match that should
      // have cleared it. Handing this player a bot on a stale entry would give
      // them two live matches at once.
      const busy = await client.query(
        `SELECT 1 FROM matches
         WHERE status IN ('pending_confirmation', 'confirmed', 'in_progress')
           AND (player1_id = $1 OR player2_id = $1)
         LIMIT 1`,
        [userId]
      );
      if (busy.rows[0]) {
        await client.query('ROLLBACK');
        continue;
      }

      const botId = await ensureTournamentBot(client, tournamentId, roundNumber);

      // The player is player1 throughout, so the bot is always player2 — it
      // keeps the scoreline halves predictable for anyone reading these rows.
      //
      // If the player already batted this round, their solo innings is the
      // target and the bot chases it. If they have not, the chase is left
      // unset: the bot bats first, and it does so on the player's first poll so
      // that its innings and the target the player is shown are written
      // together. See `playPendingBotInnings` on the API side.
      const soloTarget =
        meta.hasPlayedSolo === '1' && meta.soloTarget ? parseInt(meta.soloTarget, 10) : null;
      const hasSolo = soloTarget !== null && Number.isFinite(soloTarget);

      const chase = hasSolo
        ? { chaseTarget: soloTarget, chasePlayerId: botId }
        : { chaseTarget: null, chasePlayerId: null };
      const initialScores = initialScoresForChase(userId, chase);

      const slotId = meta.slotId || null;
      // Two VR players share a window, not a venue. The bot is always VR, so a
      // venue is only involved when the player themselves is attending one —
      // and then it is the venue they already booked, taking no new capacity.
      const venueId = meta.hasVr === '1' ? null : meta.preferredVenueId || null;

      const created = await client.query(
        `INSERT INTO matches
           (tournament_id, player1_id, player2_id, venue_id, time_slot_id, status, scheduled_at, round_number, phase, result)
         VALUES ($1, $2, $3, $4, $5, 'confirmed', $6, $7, 'normal', $8)
         RETURNING id`,
        [
          tournamentId,
          userId,
          botId,
          venueId,
          slotId,
          meta.slotStartAt ? new Date(parseInt(meta.slotStartAt, 10)) : round.starts_at,
          roundNumber,
          JSON.stringify({
            ...initialScores,
            winnerId: null,
            player1Target: hasSolo ? soloTarget : null,
            player2Target: null,
            chaseTarget: chase.chaseTarget,
            chasePlayerId: chase.chasePlayerId,
            source: 'meta' as const,
            versusBot: true,
          }),
        ]
      );
      const matchId = created.rows[0].id as string;

      // Their solo innings, recorded as an innings — the same record ordinary
      // pairing writes for a target-setter, and what stops them being offered a
      // second one once `solo_target` is cleared below.
      if (hasSolo) {
        await client.query(
          `INSERT INTO match_innings (match_id, user_id, score, source)
           VALUES ($1, $2, $3, 'solo')
           ON CONFLICT (match_id, user_id) DO NOTHING`,
          [matchId, userId, soloTarget]
        );
      }

      await client.query(
        `UPDATE tournament_participants
         SET solo_target = NULL, solo_played_at = NULL, updated_at = NOW()
         WHERE tournament_id = $1 AND user_id = $2`,
        [tournamentId, userId]
      );

      const multi = redis.multi();
      multi.zrem(queueKey, userId);
      multi.zrem(QUEUE_GLOBAL, userId);
      multi.zrem(queueTournamentKey(tournamentId), userId);
      multi.srem(QUEUE_MEMBER, userId);
      multi.del(queuePlayerKey(userId));
      await multi.exec();

      await client.query('COMMIT');
      paired++;

      const botRow = await pool.query(`SELECT username, skill_tier FROM users WHERE id = $1`, [
        botId,
      ]);
      const payload = {
        matchId,
        opponent: {
          id: botId,
          username: botRow.rows[0]?.username ?? 'Opponent',
          skillTier: botRow.rows[0]?.skill_tier ?? 3,
        },
        venue: undefined,
        slot: undefined,
        chaseTarget: chase.chaseTarget,
        amChasing: !hasSolo,
        autoConfirmed: true,
        confirmDeadline: null,
      };

      await emitToUser(redis, userId, 'match:found', payload);
      await notificationQueue.add(
        'dispatch',
        {
          userId,
          type: 'match_found',
          channels: ['in_app', 'email'],
          payload,
          idempotencyKey: `match-found:${matchId}:${userId}`,
        },
        { jobId: `match-found~${matchId}~${userId}` }
      );

      console.log(
        `Tournament ${tournamentId}: ${userId} had no opponent left in round ${roundNumber} — matched with bot ${botId} (match ${matchId})`
      );
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(`Bot fallback failed for ${userId} in ${tournamentId}:`, err);
    } finally {
      client.release();
    }
  }

  return paired;
}
