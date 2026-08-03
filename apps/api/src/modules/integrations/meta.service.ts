import type { Pool } from 'pg';
import type {
  MatchResultExtended,
  MetaCurrentMatchResponse,
  MetaSoloTargetInput,
  MetaSubmitScoreInput,
} from '@vr-tournament/shared';
import {
  QUEUE_MEMBER,
  isSlotEnded,
  isSlotStartPast,
  parseQueuePlayerMeta,
  queuePlayerKey,
} from '@vr-tournament/shared';
import type { RedisClient } from '../../lib/redis.js';
import type { Env } from '../../config/env.js';
import { mapMatch } from '../../lib/mappers.js';
import { AppError } from '../../lib/response.js';
import { applyMatchOutcome, assertMatchSlotPlayable } from '../../lib/match-outcome.js';
import { requeuePlayer } from '../../lib/requeue-player.js';
import { enqueuePairNow } from '../../lib/matchmaking-queue.js';

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

  async getCurrentMatch(userId: string): Promise<MetaCurrentMatchResponse> {
    // `pending_confirmation` is not playable so it is never surfaced as `match`,
    // but it still blocks a solo innings — submitSoloTarget rejects on it. Pull it
    // here too so `canSubmitSoloTarget` can never promise something /solo-target
    // would 409 on.
    const activeMatch = await this.pool.query(
      `SELECT m.id, m.tournament_id, m.player1_id, m.status, m.result,
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
      const isP1 = row.player1_id === userId;
      const result = (row.result ?? {}) as MatchResultExtended;
      const myScore = (isP1 ? result.player1Score : result.player2Score) ?? null;
      const opponentScore = (isP1 ? result.player2Score : result.player1Score) ?? null;
      const chaseTarget = result.chaseTarget ?? null;

      return {
        inQueue: false,
        tournamentId: row.tournament_id ?? null,
        canSubmitSoloTarget: false,
        match: {
          id: row.id,
          opponent: row.opponent_username,
          venue: row.venue_name ?? null,
          startTime: row.slot_start?.toISOString() ?? null,
          endTime: row.slot_end?.toISOString() ?? null,
          chaseTarget,
          amChasing: result.chasePlayerId === userId,
          // Standard mode with nothing on the board yet: this player bats first,
          // so whatever they submit becomes the score the opponent must beat.
          amSettingTarget: chaseTarget === null && myScore === null && opponentScore === null,
          myScore,
          opponentScore,
        },
      };
    }

    // No playable match — report queue state and whether a solo innings may be played now.
    const inQueue = await this.redis.sismember(QUEUE_MEMBER, userId);
    if (!inQueue) {
      return { inQueue: false, tournamentId: null, canSubmitSoloTarget: false, match: null };
    }

    const queueMeta = parseQueuePlayerMeta(await this.redis.hgetall(queuePlayerKey(userId)));
    let canSubmitSoloTarget = false;
    // `row` here can only be a pending_confirmation match, which blocks solo play.
    if (!row && queueMeta?.tournamentId && !queueMeta.soloTarget) {
      const round = await this.pool.query(
        `SELECT tp.solo_target, tr.ends_at
         FROM tournament_participants tp
         JOIN tournament_rounds tr ON tr.tournament_id = tp.tournament_id AND tr.round_number = tp.round_number
         WHERE tp.tournament_id = $1 AND tp.user_id = $2 AND tr.status = 'active'`,
        [queueMeta.tournamentId, userId]
      );
      const r = round.rows[0];
      canSubmitSoloTarget =
        !!r && r.solo_target == null && new Date(r.ends_at).getTime() > Date.now();
    }

    return {
      inQueue: true,
      tournamentId: queueMeta?.tournamentId ?? null,
      canSubmitSoloTarget,
      match: null,
    };
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

      await assertMatchSlotPlayable(client, match.time_slot_id);

      isPlayer1 = match.player1_id === userId;
      current = (match.result ?? {
        player1Score: null,
        player2Score: null,
        winnerId: null,
      }) as Record<string, unknown>;

      if (isPlayer1 && current.player1Score !== null && current.player1Score !== undefined) {
        throw new AppError('CONFLICT', 'Player 1 score already submitted', 409);
      }
      if (!isPlayer1 && current.player2Score !== null && current.player2Score !== undefined) {
        throw new AppError('CONFLICT', 'Player 2 score already submitted', 409);
      }

      updated = {
        ...current,
        player1Score: isPlayer1 ? score : (current.player1Score as number | null),
        player2Score: isPlayer1 ? (current.player2Score as number | null) : score,
        source: 'meta' as const,
      };

      await client.query(
        `UPDATE matches SET result = $1, status = 'in_progress', updated_at = NOW() WHERE id = $2`,
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
    // above guarantees exactly one submission observes both scores as set.
    if (p1 === null || p2 === null) {
      const full = await this.pool.query(`${MATCH_SELECT} WHERE m.id = $1`, [matchId]);
      return mapMatch(full.rows[0]);
    }

    const { status, result } = await applyMatchOutcome(
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
        chaseTarget: (current.chaseTarget as number | null) ?? null,
        chasePlayerId: (current.chasePlayerId as string | null) ?? null,
      },
      p1,
      p2
    );

    const full = await this.pool.query(`${MATCH_SELECT} WHERE m.id = $1`, [matchId]);
    const mapped = mapMatch(full.rows[0]);
    return { ...mapped, status: status as typeof mapped.status, result };
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
