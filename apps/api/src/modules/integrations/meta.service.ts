import type { Pool } from 'pg';
import type {
  MatchResultExtended,
  MetaCurrentMatchResponse,
  MetaMatchDecision,
  MetaSoloTargetInput,
  MetaSoloTargetState,
  MetaSubmitScoreInput,
} from '@vr-tournament/shared';
import {
  MATCH_RESULT_VISIBILITY_MS,
  MATCH_TURN_HOLD_MS,
  NO_SCORE,
  NOT_APPLICABLE,
  QUEUE_MEMBER,
  chaseTargetFor,
  generateBotScore,
  isSlotEnded,
  isSlotStartPast,
  isTurnHoldActive,
  parseQueuePlayerMeta,
  queuePlayerKey,
} from '@vr-tournament/shared';
import type { RedisClient } from '../../lib/redis.js';
import type { Env } from '../../config/env.js';
import { mapMatch } from '../../lib/mappers.js';
import { AppError } from '../../lib/response.js';
import { applyMatchOutcome, assertMatchSlotPlayable } from '../../lib/match-outcome.js';
import { requeuePlayer } from '../../lib/requeue-player.js';
import { enqueueCloseRoundNow, enqueuePairNow } from '../../lib/matchmaking-queue.js';

const MATCH_SELECT = `
  SELECT m.*,
         u1.username AS p1_username, u1.skill_tier AS p1_skill_tier, u1.has_vr_headset AS p1_has_vr,
         u2.username AS p2_username, u2.skill_tier AS p2_skill_tier, u2.has_vr_headset AS p2_has_vr,
         v.name AS venue_name, v.city AS venue_city, v.address AS venue_address,
         ts.start_time AS slot_start, ts.end_time AS slot_end
  FROM matches m
  JOIN users u1 ON u1.id = m.player1_id
  JOIN users u2 ON u2.id = m.player2_id
  LEFT JOIN venues v ON v.id = m.venue_id
  LEFT JOIN time_slots ts ON ts.id = m.time_slot_id
`;

export class MetaIntegrationService {
  constructor(
    private pool: Pool,
    private redis: RedisClient,
    private env?: Env
  ) {}

  /**
   * Make a bot opponent bat, if it is holding a match and has not yet.
   *
   * The worker creates the bot match but deliberately leaves the bot's innings
   * unplayed, so that generating it and resolving what it decides both happen
   * here — through `applyMatchOutcome`, the same path a human score takes.
   * Rating, standings, the next round and the notifications are one
   * implementation rather than two that have to be kept in step.
   *
   * Two shapes arrive here:
   *
   *  - The player already batted this round, so their solo innings is the
   *    target and the bot chases it. Both innings are complete the moment this
   *    runs and the match resolves immediately.
   *  - The player has not batted. The bot bats first and sets the target, which
   *    is why this runs before the poll is answered — the innings and the
   *    number the player is shown are written together, so they can never see a
   *    chase with nothing to chase.
   */
  private async playPendingBotInnings(userId: string): Promise<void> {
    const pending = await this.pool.query(
      `SELECT m.id, m.player1_id, m.player2_id, m.tournament_id, m.phase,
              m.round_number, m.time_slot_id, m.result,
              bot.id AS bot_id
       FROM matches m
       JOIN users bot ON bot.id = CASE WHEN m.player1_id = $1 THEN m.player2_id ELSE m.player1_id END
       WHERE (m.player1_id = $1 OR m.player2_id = $1)
         AND m.status IN ('confirmed', 'in_progress')
         AND bot.is_bot = TRUE
       LIMIT 1`,
      [userId]
    );
    const row = pending.rows[0];
    if (!row) return;

    // A closed round must not be revived by a bot innings — `settleOpenMatches`
    // owns a match whose window has passed, and generating a score here would
    // overwrite the abandonment it is about to record.
    try {
      await assertMatchSlotPlayable(this.pool, row.time_slot_id, {
        tournament_id: row.tournament_id,
        round_number: row.round_number,
      });
    } catch {
      return;
    }

    const botId = row.bot_id as string;
    const botIsPlayer1 = row.player1_id === botId;
    const score = generateBotScore();

    let resolvable: { p1: number; p2: number; result: MatchResultExtended } | null = null;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // The insert is the claim. Two polls landing together would otherwise
      // both generate an innings, and the second would silently replace the
      // first — changing a target the player may already be batting against.
      //
      // Losing the claim is not a reason to stop. The bot's innings may have
      // been recorded by an earlier poll that then failed to resolve the match
      // — a crash or a dropped connection between the two — and returning here
      // would leave that match stuck in `in_progress` with a complete
      // scoreline, which nothing downstream settles. So fall through and read
      // the innings that are actually on record.
      const claimed = await client.query(
        `INSERT INTO match_innings (match_id, user_id, score, source)
         VALUES ($1, $2, $3, 'bot')
         ON CONFLICT (match_id, user_id) DO NOTHING`,
        [row.id, botId, score]
      );
      const freshlyBatted = (claimed.rowCount ?? 0) > 0;

      const recorded = await client.query(
        `SELECT user_id, score FROM match_innings WHERE match_id = $1`,
        [row.id]
      );
      const scoreByUser = new Map<string, number>(
        recorded.rows.map((r) => [r.user_id as string, r.score as number])
      );
      const botScore = scoreByUser.get(botId) ?? score;
      const opponentScore = scoreByUser.get(userId) ?? null;

      const current = (row.result ?? {}) as MatchResultExtended;
      const updated: MatchResultExtended = {
        ...current,
        player1Score: botIsPlayer1 ? botScore : opponentScore,
        player2Score: botIsPlayer1 ? opponentScore : botScore,
        // Batting first makes the bot the target-setter, and the record of that
        // has to be written now: resolution reads `chasePlayerId` to decide who
        // was defending, and a level score goes to the defender.
        chaseTarget: current.chaseTarget ?? botScore,
        chasePlayerId: current.chasePlayerId ?? userId,
      };

      if (freshlyBatted) {
        await client.query(
          `UPDATE matches SET result = $1, status = 'in_progress', updated_at = NOW() WHERE id = $2`,
          [JSON.stringify(updated), row.id]
        );
      }
      await client.query('COMMIT');

      if (opponentScore != null) {
        resolvable = {
          p1: botIsPlayer1 ? botScore : opponentScore,
          p2: botIsPlayer1 ? opponentScore : botScore,
          result: updated,
        };
      }
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    if (resolvable) {
      await applyMatchOutcome(
        this.pool,
        this.redis,
        this.env,
        row.id,
        row,
        resolvable.result,
        resolvable.p1,
        resolvable.p2
      );
    }
  }

  /**
   * The player's most recently decided match, if it ended just now.
   *
   * Whoever bats first never sees their own result at submission time — the
   * match was still open, waiting on the opponent — so without this they would
   * only ever see the match vanish. That matters most for a tie: the pair are
   * re-queued immediately, and a player who is not shown the level scoreline
   * first simply finds themselves in a new match with no explanation.
   *
   * Restricted to matches carrying an `outcome`, which is written only when a
   * match is genuinely settled. A match cancelled by a decline has no outcome
   * and is not a result anyone needs to see.
   */
  private async loadLastDecision(userId: string): Promise<MetaMatchDecision | null> {
    const decided = await this.pool.query(
      `SELECT m.id, m.player1_id, m.result, m.updated_at,
              opp.username AS opponent_username
       FROM matches m
       JOIN users opp ON opp.id = CASE WHEN m.player1_id = $1 THEN m.player2_id ELSE m.player1_id END
       WHERE (m.player1_id = $1 OR m.player2_id = $1)
         AND m.status IN ('completed', 'cancelled')
         AND m.result->>'outcome' IS NOT NULL
         AND m.updated_at > NOW() - ($2::bigint * INTERVAL '1 millisecond')
       ORDER BY m.updated_at DESC
       LIMIT 1`,
      [userId, MATCH_RESULT_VISIBILITY_MS]
    );

    const row = decided.rows[0];
    if (!row) return null;

    const result = (row.result ?? {}) as MatchResultExtended;
    const isP1 = row.player1_id === userId;
    const tied = result.outcome === 'rematch';

    return {
      matchId: row.id,
      opponent: row.opponent_username,
      myScore: (isP1 ? result.player1Score : result.player2Score) ?? NO_SCORE,
      opponentScore: (isP1 ? result.player2Score : result.player1Score) ?? NO_SCORE,
      outcome: tied ? 'tie' : result.winnerId === userId ? 'win' : 'loss',
      rematchQueued: tied,
      decidedAt: (row.updated_at as Date).toISOString(),
    };
  }

  async getCurrentMatch(userId: string): Promise<MetaCurrentMatchResponse> {
    // Before anything is read: a bot opponent bats on the player's first poll,
    // so the answer below already reflects its innings — either as the target
    // to chase, or as a match that has just been decided.
    await this.playPendingBotInnings(userId);

    // `pending_confirmation` is not playable so it is never surfaced as `match`,
    // but it still blocks a solo innings — submitSoloTarget rejects on it. Pull it
    // here too so `canSubmitSoloTarget` can never promise something /solo-target
    // would 409 on.
    const activeMatch = await this.pool.query(
      `SELECT m.id, m.tournament_id, m.player1_id, m.player2_id, m.status, m.result,
              m.active_player_id, m.active_player_since,
              m.venue_id, m.time_slot_id,
              opp.username AS opponent_username,
              v.name AS venue_name,
              ts.start_time AS slot_start, ts.end_time AS slot_end
       FROM matches m
       JOIN users opp ON opp.id = CASE WHEN m.player1_id = $1 THEN m.player2_id ELSE m.player1_id END
       LEFT JOIN venues v ON v.id = m.venue_id
       LEFT JOIN time_slots ts ON ts.id = m.time_slot_id
       WHERE (m.player1_id = $1 OR m.player2_id = $1)
         AND m.status IN ('pending_confirmation', 'confirmed', 'in_progress')
       ORDER BY (m.status <> 'pending_confirmation') DESC, m.created_at DESC
       LIMIT 1`,
      [userId]
    );

    const row = activeMatch.rows[0];
    if (row && row.status !== 'pending_confirmation') {
      const opponentId = row.player1_id === userId ? row.player2_id : row.player1_id;

      // The innings table is the arbiter of who has batted, not the scoreline.
      // `matches.result` can be missing a half that was genuinely played — that
      // is exactly the hole that let a player bat twice — while a row here is
      // written under a primary key that makes a second innings impossible.
      const innings = await this.pool.query(
        `SELECT user_id, score FROM match_innings WHERE match_id = $1`,
        [row.id]
      );
      const scoreByUser = new Map<string, number>(
        innings.rows.map((r) => [r.user_id as string, r.score as number])
      );
      const myInnings = scoreByUser.get(userId) ?? null;
      const opponentInnings = scoreByUser.get(opponentId) ?? null;

      // Runs needed to *win*, which is one more than the opponent made. `-1`
      // stands for "no target yet" and can never be mistaken for a real
      // innings: an opponent out for a duck sets a target of 1.
      const chaseTarget =
        opponentInnings === null ? NO_SCORE : chaseTargetFor(opponentInnings);

      let amSettingTarget = false;
      let amChasing = false;
      let waitingForOpponent = false;

      if (myInnings !== null) {
        // Already batted. There is nothing left for this player to do in this
        // match — no second innings, whatever the result turns out to be. Every
        // flag off and `waitingForOpponent` on tells the headset to show the
        // scoreline and keep polling.
        //
        // Note what is deliberately absent: no outcome is reported here. The
        // match is not decided until the opponent bats, so there is nothing to
        // announce yet — not a win, not a loss, and above all not a tie. The
        // result reaches this player through `lastResult` once it exists, which
        // is what keeps a rematch prompt from appearing mid-match.
        waitingForOpponent = true;
      } else if (opponentInnings !== null) {
        // The opponent's innings is on the board, so there is no contention
        // left to resolve — this player chases a real number.
        amChasing = true;
      } else {
        // Neither has batted, and both may be standing in front of the match
        // right now. Exactly one of them may bat; the other waits and then
        // chases what the first one sets.
        const claimed = await this.claimTurn(row.id, userId);
        if (claimed) {
          amSettingTarget = true;
        } else {
          waitingForOpponent = true;
        }
      }

      return {
        inQueue: false,
        tournamentId: row.tournament_id ?? null,
        canSubmitSoloTarget: false,
        // Surfaced on the existing state field as well as the flag below, so a
        // client that switches on one string has the case covered without
        // reading the match object.
        soloTargetState: waitingForOpponent ? 'waiting_for_opponent' : 'in_match',
        match: {
          id: row.id,
          status: row.status as string,
          opponent: row.opponent_username,
          // A headset owner plays from home, so they hold a slot but no venue.
          // Both flows return the same fields either way; NOT_APPLICABLE stands
          // in for what a player of that kind does not have, so the client never
          // meets a null here.
          venueId: row.venue_id ?? NOT_APPLICABLE,
          venue: row.venue_name ?? NOT_APPLICABLE,
          timeSlotId: row.time_slot_id ?? NOT_APPLICABLE,
          startTime: row.slot_start?.toISOString() ?? NOT_APPLICABLE,
          endTime: row.slot_end?.toISOString() ?? NOT_APPLICABLE,
          chaseTarget,
          amChasing,
          amSettingTarget,
          myScore: myInnings ?? NO_SCORE,
          opponentScore: opponentInnings ?? NO_SCORE,
          waitingForOpponent,
        },
        // A match in play has no decision to report. Anything from an earlier
        // match has been superseded by this one.
        lastResult: null,
      };
    }

    // No playable match — report queue state and whether a solo innings may be played now.
    const inQueue = await this.redis.sismember(QUEUE_MEMBER, userId);
    if (!inQueue) {
      return {
        inQueue: false,
        tournamentId: null,
        canSubmitSoloTarget: false,
        soloTargetState: 'not_queued',
        match: null,
        lastResult: await this.loadLastDecision(userId),
      };
    }

    const queueMeta = parseQueuePlayerMeta(await this.redis.hgetall(queuePlayerKey(userId)));
    const soloTargetState = await this.resolveSoloTargetState(userId, queueMeta, !!row);

    return {
      inQueue: true,
      tournamentId: queueMeta?.tournamentId ?? null,
      canSubmitSoloTarget: soloTargetState === 'available',
      soloTargetState,
      match: null,
      // Carries the just-finished match, including a tie that put this player
      // straight back in the queue — which is exactly the state they are in
      // here, and would otherwise be unexplained.
      lastResult: await this.loadLastDecision(userId),
    };
  }

  /**
   * Take the match's turn for this player, if it is free.
   *
   * The whole decision is one conditional UPDATE because two headsets polling
   * in the same instant is the case this exists to settle: read-then-write
   * would let both observe a free match and both start batting, which is the
   * behaviour being fixed. Postgres picks exactly one winner here.
   *
   * The hold is claimable when nobody holds it, when this player already holds
   * it (a re-poll must not lose their own turn), or when the current hold has
   * gone stale — `MATCH_TURN_HOLD_MS` since it was granted, so a player who
   * claims the match and walks away cannot lock their opponent out for the rest
   * of the round.
   *
   * `active_player_since` is deliberately not refreshed for a player who
   * already holds the turn: the expiry runs from the grant, so a client left
   * polling on a shelf cannot renew it forever.
   */
  private async claimTurn(matchId: string, userId: string): Promise<boolean> {
    const claimed = await this.pool.query(
      `UPDATE matches
       SET active_player_id = $1,
           active_player_since = CASE WHEN active_player_id = $1 THEN active_player_since ELSE NOW() END,
           updated_at = NOW()
       WHERE id = $2
         AND (
           active_player_id IS NULL
           OR active_player_id = $1
           OR active_player_since IS NULL
           OR active_player_since < NOW() - ($3::bigint * INTERVAL '1 millisecond')
         )
       RETURNING active_player_id`,
      [userId, matchId, MATCH_TURN_HOLD_MS]
    );
    return (claimed.rowCount ?? 0) > 0;
  }

  /**
   * Every branch here mirrors one rejection in `submitSoloTarget`, so the two
   * cannot drift into disagreeing about whether an innings is playable — the
   * documented promise is that `POST /solo-target` never fails a precondition
   * the poll said was met.
   */
  private async resolveSoloTargetState(
    userId: string,
    queueMeta: ReturnType<typeof parseQueuePlayerMeta>,
    holdsMatch: boolean
  ): Promise<MetaSoloTargetState> {
    // Only a pending_confirmation match reaches here — not playable, so it is
    // never surfaced as `match`, but it still blocks an innings.
    if (holdsMatch) return 'in_match';
    if (!queueMeta?.tournamentId) return 'not_participant';

    const round = await this.pool.query(
      `SELECT tp.status, tp.solo_target, tr.ends_at
       FROM tournament_participants tp
       JOIN tournament_rounds tr ON tr.tournament_id = tp.tournament_id AND tr.round_number = tp.round_number
       WHERE tp.tournament_id = $1 AND tp.user_id = $2 AND tr.status = 'active'`,
      [queueMeta.tournamentId, userId]
    );
    const r = round.rows[0];

    // The state of the round is settled before anything about the player,
    // because a player who has already batted is precisely who sits waiting at
    // a boundary — and asking about their innings first would answer
    // `already_played` and return without ever noticing the round had run out.
    // The close would then never be requested by the people most likely to be
    // watching for it.
    //
    // No open round means either that none has been opened for them yet or —
    // far more often — that the one they were in has just ended and has not
    // been swept up. Until that close happens they can neither bat nor be
    // paired, so ask for it now rather than wait for the sweep.
    if (!r) {
      await this.requestRoundClose(queueMeta.tournamentId);
      return 'round_closed';
    }
    if (new Date(r.ends_at).getTime() <= Date.now()) {
      await this.requestRoundClose(queueMeta.tournamentId);
      return 'round_closed';
    }
    if (!['active', 'advanced'].includes(r.status)) return 'not_participant';
    // The participant row is the arbiter, not the queue hash: `submitSoloTarget`
    // enforces this against the row, and consulting a second copy is what let
    // the two drift apart in the first place.
    if (r.solo_target != null) return 'already_played';
    return 'available';
  }

  /** Best effort: a poll must still answer if the queue cannot be reached. */
  private async requestRoundClose(tournamentId: string) {
    if (!this.env) return;
    // Logged rather than swallowed: losing the nudge is survivable — the sweep
    // still closes the round — but it is the difference between a changeover
    // taking a second and taking fifteen, and a silent catch here is what hid
    // the id being rejected outright.
    await enqueueCloseRoundNow(this.env, tournamentId).catch((err) => {
      console.error('close-round-now enqueue failed:', err);
    });
  }

  async submitScore(matchId: string, input: MetaSubmitScoreInput) {
    const { userId, score } = input;

    // Claim this player's half of the scoreline under a row lock. Two headsets
    // finishing at the same instant used to read the same empty result and both
    // write it, so one score was silently dropped and the match never resolved.
    // Serialising the read-modify-write means the second writer sees the first
    // one's score: it either 409s as a duplicate or completes the pair.
    const client = await this.pool.connect();
    let match: Record<string, unknown> & {
      player1_id: string;
      player2_id: string;
      tournament_id: string | null;
      phase: string | null;
      round_number: number | null;
      time_slot_id: string | null;
    };
    let current: Record<string, unknown>;
    let updated: Record<string, unknown> & { player1Score: number | null; player2Score: number | null };
    let isPlayer1: boolean;
    // Whether this submission completed the match. True only when the opponent
    // already had an innings on record, so the pair is genuinely finished.
    let bothInningsIn = false;

    try {
      await client.query('BEGIN');

      const matchResult = await client.query(`SELECT * FROM matches WHERE id = $1 FOR UPDATE`, [
        matchId,
      ]);
      match = matchResult.rows[0];
      if (!match) throw new AppError('NOT_FOUND', 'Match not found', 404);
      if (match.player1_id !== userId && match.player2_id !== userId) {
        throw new AppError('FORBIDDEN', 'User is not a participant in this match', 403);
      }
      if (!['confirmed', 'in_progress'].includes(match.status as string)) {
        throw new AppError('CONFLICT', 'Match is not currently playable', 409);
      }

      // Pass the match so a tournament score is judged against its round
      // deadline rather than one player's slot — the two players' windows need
      // not overlap.
      await assertMatchSlotPlayable(client, match.time_slot_id, {
        tournament_id: match.tournament_id,
        round_number: match.round_number,
      });

      isPlayer1 = match.player1_id === userId;
      const opponentId = isPlayer1 ? match.player2_id : match.player1_id;
      current = (match.result ?? {
        player1Score: null,
        player2Score: null,
        winnerId: null,
      }) as Record<string, unknown>;

      // Who has already batted, read from the record that cannot be wrong. The
      // match row is locked above, so this cannot change underneath us.
      const innings = await client.query(
        `SELECT user_id, score, source FROM match_innings WHERE match_id = $1`,
        [matchId]
      );
      const mine = innings.rows.find((r) => r.user_id === userId);
      const theirs = innings.rows.find((r) => r.user_id === opponentId);

      // One innings per player per match. This is the guard that was missing:
      // it used to be inferred from `result`, and any match paired without its
      // chase fields carried no trace that the setter had already played — so
      // they were handed a second innings, this time knowing the score to beat.
      if (mine) {
        throw new AppError(
          'CONFLICT',
          mine.source === 'solo'
            ? 'Your solo target is already recorded as your score for this match — only the chaser submits'
            : 'You have already played your innings in this match',
          409
        );
      }

      // The turn lock. A player may bat when the opponent's innings is already
      // on the board (they are the chaser, and there is nothing to contend
      // with), or when they hold the match. Anyone else is being told to wait,
      // and a score arriving from them is an innings played blind — the exact
      // parallel play this prevents.
      if (!theirs) {
        const holder = match.active_player_id as string | null;
        const heldSince = match.active_player_since as Date | null;
        const holdStands = isTurnHoldActive(holder, heldSince);
        if (holdStands && holder !== userId) {
          throw new AppError(
            'CONFLICT',
            'Your opponent is playing this match right now — wait for their score, then chase it',
            409
          );
        }
        // Nobody holds it, or the hold lapsed: this submission claims it.
        await client.query(
          `UPDATE matches SET active_player_id = $1, active_player_since = NOW() WHERE id = $2`,
          [userId, matchId]
        );
      }

      await client.query(
        `INSERT INTO match_innings (match_id, user_id, score, source) VALUES ($1, $2, $3, 'meta')`,
        [matchId, userId, score]
      );

      // Matches paired before the setter's innings was recorded still carry an
      // empty half. Filling it from the opponent's recorded innings means those
      // resolve on this submission too, instead of hanging until the round
      // expires waiting on an innings that was already played.
      const opponentScore = theirs ? (theirs.score as number) : null;
      // The opponent had already batted, so this submission is the second and
      // last one — the match is decided now. Read off the innings table rather
      // than the scoreline: a chase seeds the setter's score half at pairing,
      // so "both halves non-null" can be true while only one innings has
      // actually been played. Resolving on that would declare a tie against a
      // seeded placeholder and re-queue a player mid-innings.
      bothInningsIn = !!theirs;

      updated = {
        ...current,
        player1Score: isPlayer1
          ? score
          : ((current.player1Score as number | null) ?? opponentScore),
        player2Score: isPlayer1
          ? ((current.player2Score as number | null) ?? opponentScore)
          : score,
        // Batting first makes this player the target-setter, and that has to be
        // recorded now rather than inferred later: resolution reads
        // `chasePlayerId` to decide who was defending, and a level score goes to
        // the defender. Without this a plain match carried no chase at all, and
        // a tie fell back on player1 winning — which is only right when player1
        // happens to be the one who batted first. Under the turn lock that is a
        // coin flip, so the tie would have gone to the wrong player half the time.
        chaseTarget: (current.chaseTarget as number | null) ?? score,
        chasePlayerId: (current.chasePlayerId as string | null) ?? opponentId,
        source: 'meta' as const,
      };

      // The turn is released on the way out: whichever player was holding it,
      // their innings is now recorded, and the other player must be free to
      // chase it immediately rather than wait out the hold.
      await client.query(
        `UPDATE matches
         SET result = $1, status = 'in_progress',
             active_player_id = NULL, active_player_since = NULL,
             updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify(updated), matchId]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    const p1 = updated.player1Score;
    const p2 = updated.player2Score;

    // Only the request that completed the pair resolves the match. The lock
    // above guarantees exactly one submission observes both innings on record.
    //
    // `bothInningsIn` is the gate, not the scoreline: while the opponent still
    // has an innings to play there is nothing to decide, and in particular no
    // tie to declare. The first submission always returns here.
    if (!bothInningsIn || p1 === null || p2 === null) {
      // Answer in the same shape as the poll. The headset already parses that
      // payload, so submitting a score needs no second parser and no special
      // case: the match comes back with this innings recorded and
      // `waitingForOpponent` set, exactly as the next poll would report it.
      return this.getCurrentMatch(userId);
    }

    await applyMatchOutcome(
      this.pool,
      this.redis,
      this.env,
      matchId,
      match,
      {
        ...updated,
        winnerId: null,
        player1Target: (current.player1Target as number | null) ?? null,
        player2Target: (current.player2Target as number | null) ?? null,
        // chaseTarget / chasePlayerId come from `updated`, not `current`.
        // Re-reading `current` here would drop the chase this submission just
        // established when it was the first innings of a plain match, and the
        // tie would fall back on player1 rather than whoever was defending.
      },
      p1,
      p2
    );

    // Same shape again. The match is decided, so `match` is null and the
    // outcome arrives on `lastResult` — the same way the poll would deliver it
    // a moment later.
    return this.getCurrentMatch(userId);
  }

  async submitSoloTarget(input: MetaSoloTargetInput) {
    const { userId, tournamentId, target } = input;

    const inQueue = await this.redis.sismember(QUEUE_MEMBER, userId);
    if (!inQueue) {
      throw new AppError('CONFLICT', 'Player must be in queue to submit a solo target', 409);
    }

    const activeMatch = await this.pool.query(
      `SELECT id FROM matches
       WHERE (player1_id = $1 OR player2_id = $1)
         AND status IN ('pending_confirmation', 'confirmed', 'in_progress')
       LIMIT 1`,
      [userId]
    );
    if (activeMatch.rows[0]) {
      throw new AppError('CONFLICT', 'Cannot submit solo target while in an active match', 409);
    }

    const participant = await this.pool.query(
      `SELECT tp.*, tr.ends_at AS round_ends
       FROM tournament_participants tp
       JOIN tournament_rounds tr ON tr.tournament_id = tp.tournament_id AND tr.round_number = tp.round_number
       WHERE tp.tournament_id = $1 AND tp.user_id = $2 AND tr.status = 'active'`,
      [tournamentId, userId]
    );
    const p = participant.rows[0];
    if (!p) throw new AppError('FORBIDDEN', 'Not an active tournament participant', 403);
    if (!['active', 'advanced'].includes(p.status)) {
      throw new AppError('FORBIDDEN', 'Participant is not active in this round', 403);
    }
    if (new Date(p.round_ends).getTime() <= Date.now()) {
      throw new AppError('CONFLICT', 'Round has ended', 409);
    }
    // One innings per round. A headset retrying after a network timeout used to
    // overwrite the stored target, which silently changes who sets the chase.
    if (p.solo_target !== null && p.solo_target !== undefined) {
      throw new AppError('CONFLICT', 'Solo target already submitted for this round', 409);
    }

    const reg = await this.pool.query(
      `SELECT b.id AS booking_id, ts.start_time, ts.end_time
       FROM tournament_registrations tr
       LEFT JOIN bookings b ON b.id = tr.booking_id AND b.status = 'confirmed'
       LEFT JOIN time_slots ts ON ts.id = b.time_slot_id
       WHERE tr.tournament_id = $1 AND tr.user_id = $2`,
      [tournamentId, userId]
    );
    const booking = reg.rows[0];
    if (booking?.end_time && isSlotEnded(booking.end_time)) {
      throw new AppError('CONFLICT', 'Your booked slot has ended', 409);
    }
    if (booking?.start_time && isSlotStartPast(booking.start_time) && booking?.end_time && !isSlotEnded(booking.end_time)) {
      // slot in progress — allowed
    }

    const soloPlayedAt = Date.now();
    // `solo_target IS NULL` makes the write itself the arbiter, so two
    // simultaneous submissions can never both land.
    const claimed = await this.pool.query(
      `UPDATE tournament_participants
       SET solo_target = $1, solo_played_at = $2, updated_at = NOW()
       WHERE tournament_id = $3 AND user_id = $4 AND solo_target IS NULL`,
      [target, new Date(soloPlayedAt), tournamentId, userId]
    );
    if (claimed.rowCount === 0) {
      throw new AppError('CONFLICT', 'Solo target already submitted for this round', 409);
    }

    const queueKey = queuePlayerKey(userId);
    await this.redis.hset(queueKey, {
      hasPlayedSolo: '1',
      soloTarget: String(target),
      soloPlayedAt: String(soloPlayedAt),
    });

    let preferredVenueId: string | null = null;
    const bookingId = booking?.booking_id ?? null;
    if (bookingId) {
      const v = await this.pool.query(
        `SELECT ts.venue_id, ts.end_time FROM bookings b
         JOIN time_slots ts ON ts.id = b.time_slot_id WHERE b.id = $1`,
        [bookingId]
      );
      preferredVenueId = v.rows[0]?.venue_id ?? null;
      if (v.rows[0]?.end_time) {
        await this.redis.hset(queueKey, {
          slotEndAt: String(new Date(v.rows[0].end_time).getTime()),
        });
      }
    }

    await requeuePlayer(
      this.pool,
      this.redis,
      userId,
      {
        tournamentId,
        roundNumber: p.round_number,
        preferredVenueId,
        bookingId,
        hasPlayedSolo: true,
        soloTarget: target,
        soloPlayedAt,
        refreshIfQueued: true,
      },
      this.env
    );

    if (this.env) {
      await enqueuePairNow(this.env, tournamentId);
    }

    return { target, soloPlayedAt: new Date(soloPlayedAt).toISOString(), inQueue: true };
  }
}
