import type { Pool } from 'pg';
import type { RedisClient } from '../../../lib/redis.js';
import type { Env } from '../../../config/env.js';
import type {
  AdminAssignTournamentAdminInput,
  AdminCreateRegistrationInput,
  AdminCreateRoundInput,
  AdminTournamentListQuery,
  AdminUpdateParticipantInput,
  AdminUpdateRoundInput,
  AdminUpdateTournamentInput,
  CreateTournamentInput,
} from '@vr-tournament/shared';
import {
  mapBuyback,
  mapParticipant,
  mapRegistration,
  mapTournament,
  mapTournamentRound,
} from '../../../lib/mappers.js';
import { AppError } from '../../../lib/response.js';
import { writeAudit } from '../../../lib/audit.js';
import { TournamentsService } from '../../tournaments/tournaments.service.js';

export class AdminTournamentsService {
  private tournaments: TournamentsService;

  constructor(
    private pool: Pool,
    redis: RedisClient,
    env: Env
  ) {
    this.tournaments = new TournamentsService(pool, redis, env);
  }

  list(query: AdminTournamentListQuery) {
    return this.listAdmin(query);
  }

  async listAdmin(query: AdminTournamentListQuery) {
    const params: unknown[] = [];
    let where = 'WHERE 1=1';

    if (query.status) {
      params.push(query.status);
      where += ` AND t.status = $${params.length}`;
    }
    if (query.phase) {
      params.push(query.phase);
      where += ` AND t.phase = $${params.length}`;
    }
    if (query.search) {
      params.push(`%${query.search}%`);
      where += ` AND (t.name ILIKE $${params.length} OR t.game ILIKE $${params.length})`;
    }
    if (query.cursor) {
      params.push(query.cursor);
      where += ` AND t.id < $${params.length}`;
    }

    params.push(query.limit + 1);
    const limitIdx = params.length;

    const result = await this.pool.query(
      `SELECT t.*,
              (SELECT COUNT(*)::int FROM tournament_registrations tr WHERE tr.tournament_id = t.id) AS registration_count
       FROM tournaments t
       ${where}
       ORDER BY t.start_date ASC, t.id DESC
       LIMIT $${limitIdx}`,
      params
    );

    const rows = result.rows;
    const hasMore = rows.length > query.limit;
    const items = (hasMore ? rows.slice(0, query.limit) : rows).map(mapTournament);

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
    };
  }

  getById(id: string) {
    return this.tournaments.getById(id);
  }

  async create(actorId: string, input: CreateTournamentInput) {
    const tournament = await this.tournaments.create(input);
    await writeAudit(this.pool, {
      actorId,
      action: 'tournament.create',
      entityType: 'tournament',
      entityId: tournament.id,
      after: tournament as unknown as Record<string, unknown>,
    });
    return tournament;
  }

  async update(actorId: string, id: string, input: AdminUpdateTournamentInput) {
    const before = await this.getById(id);
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const map: Array<[keyof AdminUpdateTournamentInput, string]> = [
      ['name', 'name'],
      ['game', 'game'],
      ['startDate', 'start_date'],
      ['endDate', 'end_date'],
      ['status', 'status'],
      ['maxPlayers', 'max_players'],
      ['skillTier', 'skill_tier'],
      ['phase', 'phase'],
      ['currentRoundNumber', 'current_round_number'],
      ['buybackPriceCents', 'buyback_price_cents'],
      ['roundDurationMinutes', 'round_duration_minutes'],
      ['initialPlayerCount', 'initial_player_count'],
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

    const result = await this.pool.query(
      `UPDATE tournaments SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    const tournament = mapTournament(result.rows[0]);
    await writeAudit(this.pool, {
      actorId,
      action: 'tournament.update',
      entityType: 'tournament',
      entityId: id,
      before: before as unknown as Record<string, unknown>,
      after: tournament as unknown as Record<string, unknown>,
    });
    return tournament;
  }

  async delete(actorId: string, id: string) {
    const before = await this.getById(id);
    await this.pool.query('DELETE FROM tournaments WHERE id = $1', [id]);
    await writeAudit(this.pool, {
      actorId,
      action: 'tournament.delete',
      entityType: 'tournament',
      entityId: id,
      before: before as unknown as Record<string, unknown>,
    });
  }

  async publish(actorId: string, id: string) {
    return this.update(actorId, id, { status: 'open' });
  }

  async closeRegistration(actorId: string, id: string) {
    return this.update(actorId, id, { status: 'closed' });
  }

  async start(actorId: string, id: string) {
    const countResult = await this.pool.query(
      `SELECT COUNT(*)::int AS count FROM tournament_registrations WHERE tournament_id = $1`,
      [id]
    );
    const initialPlayerCount = countResult.rows[0]?.count ?? 0;
    return this.update(actorId, id, {
      status: 'in_progress',
      initialPlayerCount: initialPlayerCount > 0 ? initialPlayerCount : undefined,
    });
  }

  async complete(actorId: string, id: string) {
    return this.update(actorId, id, { status: 'completed', phase: 'completed' });
  }

  getRounds(id: string) {
    return this.tournaments.getRounds(id);
  }

  async createRound(actorId: string, tournamentId: string, input: AdminCreateRoundInput) {
    const result = await this.pool.query(
      `INSERT INTO tournament_rounds (tournament_id, round_number, starts_at, ends_at, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        tournamentId,
        input.roundNumber,
        input.startsAt,
        input.endsAt,
        input.status ?? 'active',
      ]
    );
    const round = mapTournamentRound(result.rows[0]);
    await writeAudit(this.pool, {
      actorId,
      action: 'round.create',
      entityType: 'tournament_round',
      entityId: round.id,
      after: round as unknown as Record<string, unknown>,
    });
    return round;
  }

  async updateRound(actorId: string, id: string, input: AdminUpdateRoundInput) {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (input.startsAt !== undefined) {
      fields.push(`starts_at = $${idx++}`);
      values.push(input.startsAt);
    }
    if (input.endsAt !== undefined) {
      fields.push(`ends_at = $${idx++}`);
      values.push(input.endsAt);
    }
    if (input.status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(input.status);
    }
    if (fields.length === 0) {
      const r = await this.pool.query('SELECT * FROM tournament_rounds WHERE id = $1', [id]);
      if (!r.rows[0]) throw new AppError('NOT_FOUND', 'Round not found', 404);
      return mapTournamentRound(r.rows[0]);
    }
    values.push(id);
    const result = await this.pool.query(
      `UPDATE tournament_rounds SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (!result.rows[0]) throw new AppError('NOT_FOUND', 'Round not found', 404);
    await writeAudit(this.pool, {
      actorId,
      action: 'round.update',
      entityType: 'tournament_round',
      entityId: id,
    });
    return mapTournamentRound(result.rows[0]);
  }

  async closeRound(actorId: string, tournamentId: string, roundNumber: number) {
    await this.tournaments.closeRound(tournamentId, roundNumber);
    await writeAudit(this.pool, {
      actorId,
      action: 'round.close',
      entityType: 'tournament',
      entityId: tournamentId,
      after: { roundNumber },
    });
    return this.getById(tournamentId);
  }

  listRegistrations(tournamentId: string) {
    return this.pool
      .query(
        `SELECT tr.*, u.username, u.email
         FROM tournament_registrations tr
         JOIN users u ON u.id = tr.user_id
         WHERE tr.tournament_id = $1
         ORDER BY tr.registered_at`,
        [tournamentId]
      )
      .then((r) =>
        r.rows.map((row) => ({
          ...mapRegistration(row),
          username: row.username,
          email: row.email,
        }))
      );
  }

  async createRegistration(actorId: string, tournamentId: string, input: AdminCreateRegistrationInput) {
    const tournament = await this.getById(tournamentId);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO tournament_registrations (tournament_id, user_id, booking_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (tournament_id, user_id) DO UPDATE SET booking_id = COALESCE(EXCLUDED.booking_id, tournament_registrations.booking_id)
         RETURNING *`,
        [tournamentId, input.userId, input.bookingId ?? null]
      );
      await client.query(
        `INSERT INTO tournament_participants (tournament_id, user_id, status, round_number)
         VALUES ($1, $2, 'active', $3)
         ON CONFLICT (tournament_id, user_id) DO NOTHING`,
        [tournamentId, input.userId, tournament.currentRoundNumber]
      );
      await client.query('COMMIT');
      const reg = mapRegistration(result.rows[0]);
      await writeAudit(this.pool, {
        actorId,
        action: 'registration.create',
        entityType: 'tournament',
        entityId: tournamentId,
        after: { userId: input.userId },
      });
      return reg;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async deleteRegistration(actorId: string, tournamentId: string, userId: string) {
    await this.tournaments.withdraw(tournamentId, userId);
    await writeAudit(this.pool, {
      actorId,
      action: 'registration.delete',
      entityType: 'tournament',
      entityId: tournamentId,
      before: { userId },
    });
  }

  getParticipants(tournamentId: string) {
    return this.tournaments.getParticipants(tournamentId);
  }

  getMatches(tournamentId: string, query: { round?: number; phase?: 'normal' | 'knockout' }) {
    return this.tournaments.getMatches(tournamentId, query);
  }

  getBracket(tournamentId: string) {
    return this.tournaments.getBracket(tournamentId);
  }

  async getParticipant(id: string) {
    const result = await this.pool.query(
      `SELECT tp.*, u.username, u.email FROM tournament_participants tp
       JOIN users u ON u.id = tp.user_id WHERE tp.id = $1`,
      [id]
    );
    if (!result.rows[0]) throw new AppError('NOT_FOUND', 'Participant not found', 404);
    return {
      ...mapParticipant(result.rows[0]),
      username: result.rows[0].username,
      email: result.rows[0].email,
    };
  }

  async updateParticipant(actorId: string, id: string, input: AdminUpdateParticipantInput) {
    const before = await this.getParticipant(id);
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const map: Array<[keyof AdminUpdateParticipantInput, string, (v: unknown) => unknown]> = [
      ['status', 'status', (v) => v],
      ['wins', 'wins', (v) => v],
      ['losses', 'losses', (v) => v],
      ['buybackCount', 'buyback_count', (v) => v],
      ['roundNumber', 'round_number', (v) => v],
      ['soloTarget', 'solo_target', (v) => v],
      ['soloPlayedAt', 'solo_played_at', (v) => v],
    ];

    for (const [key, col, transform] of map) {
      if (input[key] !== undefined) {
        fields.push(`${col} = $${idx++}`);
        values.push(transform(input[key]));
      }
    }

    if (fields.length === 0) return before;

    fields.push('updated_at = NOW()');
    values.push(id);

    const result = await this.pool.query(
      `UPDATE tournament_participants SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    const participant = await this.getParticipant(result.rows[0].id);
    await writeAudit(this.pool, {
      actorId,
      action: 'participant.update',
      entityType: 'tournament_participant',
      entityId: id,
      before: before as unknown as Record<string, unknown>,
      after: participant as unknown as Record<string, unknown>,
    });
    return participant;
  }

  async deleteParticipant(actorId: string, id: string) {
    const before = await this.getParticipant(id);
    await this.pool.query('DELETE FROM tournament_participants WHERE id = $1', [id]);
    await writeAudit(this.pool, {
      actorId,
      action: 'participant.delete',
      entityType: 'tournament_participant',
      entityId: id,
      before: before as unknown as Record<string, unknown>,
    });
  }

  async syncParticipantStats(actorId: string, tournamentId: string) {
    await this.pool.query(
      `UPDATE tournament_participants tp SET
         wins = COALESCE(s.w, 0),
         losses = COALESCE(s.l, 0),
         updated_at = NOW()
       FROM (
         SELECT user_id,
           COUNT(*) FILTER (WHERE won) AS w,
           COUNT(*) FILTER (WHERE NOT won) AS l
         FROM (
           SELECT player1_id AS user_id, (result->>'winnerId')::uuid = player1_id AS won
           FROM matches WHERE tournament_id = $1 AND status = 'completed'
           UNION ALL
           SELECT player2_id, (result->>'winnerId')::uuid = player2_id
           FROM matches WHERE tournament_id = $1 AND status = 'completed'
         ) x GROUP BY user_id
       ) s
       WHERE tp.tournament_id = $1 AND tp.user_id = s.user_id`,
      [tournamentId]
    );
    await writeAudit(this.pool, {
      actorId,
      action: 'participant.sync_stats',
      entityType: 'tournament',
      entityId: tournamentId,
    });
    return this.getParticipants(tournamentId);
  }

  listBuybacks(tournamentId: string) {
    return this.pool
      .query(
        `SELECT b.*, u.username FROM buybacks b
         JOIN users u ON u.id = b.user_id
         WHERE b.tournament_id = $1 ORDER BY b.created_at DESC`,
        [tournamentId]
      )
      .then((r) =>
        r.rows.map((row) => ({
          ...mapBuyback(row),
          username: row.username,
        }))
      );
  }

  async listTournamentAdmins(tournamentId: string) {
    const result = await this.pool.query(
      `SELECT u.id, u.email, u.username, ta.created_at
       FROM tournament_admins ta JOIN users u ON u.id = ta.user_id
       WHERE ta.tournament_id = $1`,
      [tournamentId]
    );
    return result.rows.map((r) => ({
      userId: r.id,
      email: r.email,
      username: r.username,
      assignedAt: r.created_at.toISOString(),
    }));
  }

  async assignTournamentAdmin(
    actorId: string,
    tournamentId: string,
    input: AdminAssignTournamentAdminInput
  ) {
    await this.getById(tournamentId);
    await this.pool.query(
      `INSERT INTO tournament_admins (user_id, tournament_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [input.userId, tournamentId]
    );
    await this.pool.query(
      `UPDATE users SET role = 'tournament_admin' WHERE id = $1 AND role = 'player'`,
      [input.userId]
    );
    await writeAudit(this.pool, {
      actorId,
      action: 'tournament.assign_admin',
      entityType: 'tournament',
      entityId: tournamentId,
      after: { userId: input.userId },
    });
  }

  async removeTournamentAdmin(actorId: string, tournamentId: string, userId: string) {
    await this.pool.query(`DELETE FROM tournament_admins WHERE tournament_id = $1 AND user_id = $2`, [
      tournamentId,
      userId,
    ]);
    await writeAudit(this.pool, {
      actorId,
      action: 'tournament.remove_admin',
      entityType: 'tournament',
      entityId: tournamentId,
      before: { userId },
    });
  }
}
