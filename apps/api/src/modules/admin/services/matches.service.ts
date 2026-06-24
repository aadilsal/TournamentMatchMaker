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
import { applyMatchOutcome } from '../../../lib/match-outcome.js';
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
    switch (view) {
      case 'ongoing':
        return `m.status IN ('pending_confirmation', 'confirmed', 'in_progress')`;
      case 'upcoming':
        return `m.status IN ('confirmed', 'pending_confirmation') AND (m.scheduled_at > NOW() OR ts.start_time > NOW())`;
      case 'past':
        return `m.status IN ('completed', 'cancelled', 'expired')`;
      default:
        return '1=1';
    }
  }

  async list(query: AdminMatchListQuery) {
    const params: unknown[] = [];
    let where = `WHERE ${this.viewFilter(query.view)}`;

    if (query.tournamentId) {
      params.push(query.tournamentId);
      where += ` AND m.tournament_id = $${params.length}`;
    }
    if (query.status) {
      params.push(query.status);
      where += ` AND m.status = $${params.length}`;
    }
    if (query.cursor) {
      params.push(query.cursor);
      where += ` AND m.id < $${params.length}`;
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
    const result = await this.pool.query(
      `INSERT INTO matches (tournament_id, player1_id, player2_id, venue_id, time_slot_id,
        status, scheduled_at, round_number, phase, bracket_slot)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        input.tournamentId ?? null,
        input.player1Id,
        input.player2Id,
        input.venueId ?? null,
        input.timeSlotId ?? null,
        input.status ?? 'pending_confirmation',
        input.scheduledAt ?? null,
        input.roundNumber ?? null,
        input.phase ?? null,
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
    await this.redis.hset(matchConfirmKey(id), match.player1Id, '1', match.player2Id, '1');
    await this.pool.query(
      `UPDATE matches SET status = 'confirmed', updated_at = NOW() WHERE id = $1`,
      [id]
    );
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
    if (match.timeSlotId) {
      await releaseSlotLock(this.pool, this.redis, match.timeSlotId);
    }
    await this.redis.del(matchConfirmKey(id));
    await this.pool.query(
      `UPDATE matches SET status = 'expired', updated_at = NOW() WHERE id = $1`,
      [id]
    );
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

    const existing = (match.result as MatchResultExtended) ?? {};
    const result: MatchResultExtended = {
      ...existing,
      player1Score: input.player1Score ?? existing.player1Score ?? null,
      player2Score: input.player2Score ?? existing.player2Score ?? null,
      winnerId: input.winnerId ?? existing.winnerId ?? null,
      source: input.source ?? existing.source ?? 'manual',
    };

    if (input.winnerId && input.player1Score == null && input.player2Score == null) {
      await this.pool.query(
        `UPDATE matches SET result = $1, status = 'completed', updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(result), id]
      );
    } else if (
      input.player1Score != null &&
      input.player2Score != null
    ) {
      await applyMatchOutcome(
        this.pool,
        this.redis,
        this.env,
        id,
        match,
        result,
        input.player1Score,
        input.player2Score
      );
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
