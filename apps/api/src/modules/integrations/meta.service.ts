import type { Pool } from 'pg';
import type {
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
  queueTournamentKey,
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
    const inQueue = await this.redis.sismember(QUEUE_MEMBER, userId);
    const queueMeta = parseQueuePlayerMeta(await this.redis.hgetall(queuePlayerKey(userId)));
    let queueSize: number | null = null;
    if (queueMeta?.tournamentId) {
      queueSize = await this.redis.zcard(queueTournamentKey(queueMeta.tournamentId));
    }

    const participant = queueMeta?.tournamentId
      ? await this.pool.query(
          `SELECT solo_target FROM tournament_participants
           WHERE tournament_id = $1 AND user_id = $2`,
          [queueMeta.tournamentId, userId]
        )
      : { rows: [] as { solo_target: number | null }[] };

    const soloTarget = participant.rows[0]?.solo_target ?? queueMeta?.soloTarget ?? null;

    let canSubmitSoloTarget = false;
    if (inQueue && queueMeta?.tournamentId && !soloTarget) {
      const round = await this.pool.query(
        `SELECT tr.ends_at FROM tournament_rounds tr
         JOIN tournament_participants tp ON tp.tournament_id = tr.tournament_id AND tp.round_number = tr.round_number
         WHERE tp.tournament_id = $1 AND tp.user_id = $2 AND tr.status = 'active'`,
        [queueMeta.tournamentId, userId]
      );
      if (round.rows[0] && new Date(round.rows[0].ends_at).getTime() > Date.now()) {
        canSubmitSoloTarget = true;
      }
    }

    const activeMatch = await this.pool.query(
      `${MATCH_SELECT}
       WHERE (m.player1_id = $1 OR m.player2_id = $1)
         AND m.status IN ('confirmed', 'in_progress')
       ORDER BY m.created_at DESC LIMIT 1`,
      [userId]
    );

    const row = activeMatch.rows[0];
    if (!row) {
      return {
        inQueue: !!inQueue,
        queueSize,
        canSubmitSoloTarget,
        soloTarget,
        match: null,
      };
    }

    const match = mapMatch(row);
    const isP1 = match.player1Id === userId;
    const opponent = isP1 ? match.player2 : match.player1;
    const result = match.result;
    const chasePlayerId = result?.chasePlayerId ?? null;

    return {
      inQueue: false,
      queueSize: null,
      canSubmitSoloTarget: false,
      soloTarget,
      match: {
        id: match.id,
        status: match.status,
        opponent: {
          id: isP1 ? match.player2Id : match.player1Id,
          username: opponent?.username ?? 'Unknown',
          skillTier: opponent?.skillTier ?? 3,
        },
        venue: match.venue
          ? { id: match.venue.id, name: match.venue.name, city: match.venue.city }
          : null,
        slot: match.slot
          ? { id: match.slot.id, startTime: match.slot.startTime, endTime: match.slot.endTime }
          : null,
        chaseTarget: result?.chaseTarget ?? null,
        amChasing: chasePlayerId === userId,
        myScore: isP1 ? (result?.player1Score ?? null) : (result?.player2Score ?? null),
        opponentScore: isP1 ? (result?.player2Score ?? null) : (result?.player1Score ?? null),
        scheduledAt: match.scheduledAt,
      },
    };
  }

  async submitScore(matchId: string, input: MetaSubmitScoreInput) {
    const { userId, score } = input;

    const matchResult = await this.pool.query(`SELECT * FROM matches WHERE id = $1`, [matchId]);
    const match = matchResult.rows[0];
    if (!match) throw new AppError('NOT_FOUND', 'Match not found', 404);
    if (match.player1_id !== userId && match.player2_id !== userId) {
      throw new AppError('FORBIDDEN', 'User is not a participant in this match', 403);
    }
    if (!['confirmed', 'in_progress'].includes(match.status)) {
      throw new AppError('CONFLICT', 'Match is not currently playable', 409);
    }

    await assertMatchSlotPlayable(this.pool, match.time_slot_id);

    const isPlayer1 = match.player1_id === userId;
    const current = (match.result ?? {
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

    const updated = {
      ...current,
      player1Score: isPlayer1 ? score : (current.player1Score as number | null),
      player2Score: isPlayer1 ? (current.player2Score as number | null) : score,
      source: 'meta' as const,
    };

    const p1 = updated.player1Score as number | null;
    const p2 = updated.player2Score as number | null;

    if (p1 === null || p2 === null) {
      await this.pool.query(
        `UPDATE matches SET result = $1, status = 'in_progress', updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(updated), matchId]
      );
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
    await this.pool.query(
      `UPDATE tournament_participants
       SET solo_target = $1, solo_played_at = $2, updated_at = NOW()
       WHERE tournament_id = $3 AND user_id = $4`,
      [target, new Date(soloPlayedAt), tournamentId, userId]
    );

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
