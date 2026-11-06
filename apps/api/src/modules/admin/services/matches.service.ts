import type { Pool } from 'pg';
import type { RedisClient } from '../../../lib/redis.js';
import type { Env } from '../../../config/env.js';
import type {
  AdminCreateMatchInput,
  AdminMatchListQuery,
  AdminMatchResultInput,
  AdminUpdateMatchInput,
  MatchResultExtended,
} from '@vr-tournament/shared';
import { mapMatch } from '../../../lib/mappers.js';
import { AppError } from '../../../lib/response.js';
import { writeAudit } from '../../../lib/audit.js';
import { matchConfirmKey } from '../../../lib/queue-keys.js';
import { applyMatchOutcome, applyMatchWinner } from '../../../lib/match-outcome.js';
import { MatchesService } from '../../matches/matches.service.js';
import { releaseSlotLock } from '../../../lib/slot-lock.js';

const MATCH_SELECT = `
  SELECT m.*,
         u1.username AS p1_username, u1.skill_tier AS p1_skill_tier, u1.has_vr_headset AS p1_has_vr,
         u2.username AS p2_username, u2.skill_tier AS p2_skill_tier, u2.has_vr_headset AS p2_has_vr,
         v.name AS venue_name, v.city AS venue_city, v.address AS venue_address,
         ts.start_time AS slot_start, ts.end_time AS slot_end,
         t.name AS tournament_name
  FROM matches m
  JOIN users u1 ON u1.id = m.player1_id
  JOIN users u2 ON u2.id = m.player2_id
  LEFT JOIN venues v ON v.id = m.venue_id
  LEFT JOIN time_slots ts ON ts.id = m.time_slot_id
  LEFT JOIN tournaments t ON t.id = m.tournament_id
`;

/** List views (aliases `m`, `ts`); the dashboard counts use these same predicates. */
export const MATCH_VIEW_FILTERS = {
  ongoing: `m.status IN ('pending_confirmation', 'confirmed', 'in_progress')`,
  upcoming: `m.status IN ('confirmed', 'pending_confirmation') AND (m.scheduled_at > NOW() OR ts.start_time > NOW())`,
  past: `m.status IN ('completed', 'cancelled', 'expired')`,
} as const;

export class AdminMatchesService {
  private matches: MatchesService;

  constructor(
    private pool: Pool,
    private redis: RedisClient,
    private env: Env
  ) {
    this.matches = new MatchesService(pool, redis, env);
  }

  private viewFilter(view: AdminMatchListQuery['view']): string {
    return view && view !== 'all' ? MATCH_VIEW_FILTERS[view] : '1=1';
  }

  /** `tournamentIds`: null = every tournament, [] = nothing in scope. */
  async list(query: AdminMatchListQuery & { tournamentIds?: string[] | null }) {
    const params: unknown[] = [];
    let where = `WHERE ${this.viewFilter(query.view)}`;

    if (query.tournamentIds) {
      params.push(query.tournamentIds);
      where += ` AND m.tournament_id = ANY($${params.length})`;
    }
    if (query.tournamentId) {
      params.push(query.tournamentId);
      where += ` AND m.tournament_id = $${params.length}`;
    }
    if (query.status) {
      params.push(query.status);
      where += ` AND m.status = $${params.length}`;
    }
    if (query.cursor) {
      // Keyset on the same columns the rows are ordered by. Comparing ids
      // alone (random UUIDs) let pages overlap and silently skip rows.
      params.push(query.cursor);
      where += ` AND (m.created_at, m.id) <
                     (SELECT c.created_at, c.id FROM matches c WHERE c.id = $${params.length})`;
    }

    params.push(query.limit + 1);
    const limitIdx = params.length;

    const result = await this.pool.query(
      `${MATCH_SELECT} ${where}
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT $${limitIdx}`,
      params
    );

    const rows = result.rows;
    const hasMore = rows.length > query.limit;
    const items = (hasMore ? rows.slice(0, query.limit) : rows).map((row) => ({
      ...mapMatch(row),
      tournamentName: row.tournament_name ?? null,
    }));

    return { items, nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null };
  }

  async getById(id: string) {
    const result = await this.pool.query(`${MATCH_SELECT} WHERE m.id = $1`, [id]);
    if (!result.rows[0]) throw new AppError('NOT_FOUND', 'Match not found', 404);
    const match = mapMatch(result.rows[0]);
    const confirms =
      match.status === 'pending_confirmation'
        ? await this.redis.hgetall(matchConfirmKey(id))
        : null;
    return {
      ...match,
      tournamentName: result.rows[0].tournament_name ?? null,
      confirmations: confirms
        ? {
            player1Confirmed: confirms[match.player1Id] === '1',
            player2Confirmed: confirms[match.player2Id] === '1',
          }
        : null,
    };
  }

  async create(actorId: string, input: AdminCreateMatchInput) {
    // Schedule like a paired match: the slot gives venue and start, the tournament gives round and phase.
    const slot = input.timeSlotId
      ? (await this.pool.query(`SELECT venue_id, start_time FROM time_slots WHERE id = $1`, [input.timeSlotId])).rows[0]
      : null;
    if (input.timeSlotId && !slot) throw new AppError('BAD_REQUEST', 'Invalid time slot', 400);
    const tournament = input.tournamentId
      ? (await this.pool.query(`SELECT current_round_number, phase FROM tournaments WHERE id = $1`, [input.tournamentId])).rows[0]
      : null;
    if (input.tournamentId && !tournament) throw new AppError('BAD_REQUEST', 'Invalid tournament', 400);
    const result = await this.pool.query(
      `INSERT INTO matches (tournament_id, player1_id, player2_id, venue_id, time_slot_id,
        status, scheduled_at, round_number, phase, bracket_slot)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        input.tournamentId ?? null,
        input.player1Id,
        input.player2Id,
        input.venueId ?? slot?.venue_id ?? null,
        input.timeSlotId ?? null,
        input.status ?? 'pending_confirmation',
        input.scheduledAt ?? slot?.start_time ?? null,
        input.roundNumber ?? tournament?.current_round_number ?? null,
        input.phase ?? (tournament ? (tournament.phase === 'knockout' ? 'knockout' : 'normal') : null),
        input.bracketSlot ?? null,
      ]
    );
    const row = result.rows[0];
    await writeAudit(this.pool, {
      actorId,
      action: 'match.create',
      entityType: 'match',
      entityId: row.id,
    });
    return this.getById(row.id);
  }

  async update(actorId: string, id: string, input: AdminUpdateMatchInput) {
    const before = await this.getById(id);
    if (
      (input.player1Id || input.player2Id) &&
      (input.player1Id ?? before.player1Id) === (input.player2Id ?? before.player2Id)
    ) {
      throw new AppError('BAD_REQUEST', 'A player cannot be matched against themselves', 400);
    }
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const map: Array<[keyof AdminUpdateMatchInput, string]> = [
      ['player1Id', 'player1_id'],
      ['player2Id', 'player2_id'],
      ['venueId', 'venue_id'],
      ['timeSlotId', 'time_slot_id'],
      ['scheduledAt', 'scheduled_at'],
      ['status', 'status'],
      ['roundNumber', 'round_number'],
      ['phase', 'phase'],
      ['bracketSlot', 'bracket_slot'],
    ];

    for (const [key, col] of map) {
      if (input[key] !== undefined) {
        fields.push(`${col} = $${idx++}`);
        values.push(input[key]);
      }
    }

    if (fields.length === 0) return before;

    fields.push('updated_at = NOW()');
    values.push(id);

    await this.pool.query(
      `UPDATE matches SET ${fields.join(', ')} WHERE id = $${idx}`,
      values
    );
    await writeAudit(this.pool, {
      actorId,
      action: 'match.update',
      entityType: 'match',
      entityId: id,
    });
    return this.getById(id);
  }

  async delete(actorId: string, id: string) {
    const before = await this.getById(id);
    if (before.timeSlotId) {
      await releaseSlotLock(this.pool, this.redis, before.timeSlotId);
    }
    await this.redis.del(matchConfirmKey(id));
    await this.pool.query('DELETE FROM matches WHERE id = $1', [id]);
    await writeAudit(this.pool, {
      actorId,
      action: 'match.delete',
      entityType: 'match',
      entityId: id,
      before: before as unknown as Record<string, unknown>,
    });
  }

  async forceConfirm(actorId: string, id: string) {
    const match = await this.getById(id);
    const updated = await this.pool.query(
      `UPDATE matches SET status = 'confirmed', updated_at = NOW()
       WHERE id = $1 AND status = 'pending_confirmation' RETURNING id`,
      [id]
    );
    if (!updated.rowCount) {
      throw new AppError('CONFLICT', 'Only a match awaiting confirmation can be force-confirmed', 409);
    }
    await this.redis.hset(matchConfirmKey(id), match.player1Id, '1', match.player2Id, '1');
    await writeAudit(this.pool, {
      actorId,
      action: 'match.force_confirm',
      entityType: 'match',
      entityId: id,
    });
    return this.getById(id);
  }

  async forceExpire(actorId: string, id: string) {
    const match = await this.getById(id);
    const updated = await this.pool.query(
      `UPDATE matches SET status = 'expired', updated_at = NOW()
       WHERE id = $1 AND status IN ('pending_confirmation', 'confirmed', 'in_progress') RETURNING id`,
      [id]
    );
    if (!updated.rowCount) {
      throw new AppError('CONFLICT', `Match is already ${match.status}`, 409);
    }
    if (match.timeSlotId) {
      await releaseSlotLock(this.pool, this.redis, match.timeSlotId);
    }
    await this.redis.del(matchConfirmKey(id));
    await writeAudit(this.pool, {
      actorId,
      action: 'match.force_expire',
      entityType: 'match',
      entityId: id,
    });
    return this.getById(id);
  }

  async setResult(actorId: string, id: string, input: AdminMatchResultInput) {
    const row = await this.pool.query('SELECT * FROM matches WHERE id = $1', [id]);
    const match = row.rows[0];
    if (!match) throw new AppError('NOT_FOUND', 'Match not found', 404);
    // Re-applying an outcome double-counts ratings, wins and advancement; there is no safe reversal.
    if (match.status === 'completed') {
      throw new AppError('CONFLICT', 'Match already has a result', 409);
    }
    if (!['pending_confirmation', 'confirmed', 'in_progress'].includes(match.status)) {
      throw new AppError('CONFLICT', `Match is ${match.status} — a result can only be set on an open match`, 409);
    }

    const existing = (match.result as MatchResultExtended) ?? {};
    const result: MatchResultExtended = {
      ...existing,
      player1Score: input.player1Score ?? existing.player1Score ?? null,
      player2Score: input.player2Score ?? existing.player2Score ?? null,
      winnerId: input.winnerId ?? existing.winnerId ?? null,
      source: input.source ?? existing.source ?? 'manual',
    };

    // Both halves are judged on the merged result, not on this request alone.
    // Gating on `input` meant filling in the *missing* score of a half-played
    // match wrote the number and nothing else: the match stayed `in_progress`
    // with no winner, nobody advanced, and neither player was released. With a
    // chase that is the normal case, since the setter's innings is already on
    // the board when the match is created.
    if (result.player1Score != null && result.player2Score != null) {
      await applyMatchOutcome(
        this.pool,
        this.redis,
        this.env,
        id,
        match,
        result,
        result.player1Score,
        result.player2Score
      );
    } else if (input.winnerId) {
      // A winner named without a full scoreline still has to move the
      // tournament — rating, standings, advancement, elimination, the loser out
      // of the queue. Completing the row alone left every one of those undone.
      await applyMatchWinner(this.pool, this.redis, this.env, id, match, result, input.winnerId);
    } else {
      await this.pool.query(
        `UPDATE matches SET result = $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(result), id]
      );
    }

    await writeAudit(this.pool, {
      actorId,
      action: 'match.set_result',
      entityType: 'match',
      entityId: id,
      after: result as unknown as Record<string, unknown>,
    });
    return this.getById(id);
  }
}
