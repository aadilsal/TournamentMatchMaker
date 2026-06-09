import type { Pool } from 'pg';
import type { CreateTournamentInput, RegisterTournamentInput, TournamentListQuery } from '@vr-tournament/shared';
import { mapRegistration, mapTournament } from '../../lib/mappers.js';
import { AppError } from '../../lib/response.js';
import type { Env } from '../../config/env.js';
import { enqueueNotification } from '../../lib/bullmq.js';

export class TournamentsService {
  constructor(
    private pool: Pool,
    private env?: Env
  ) {}

  async list(query: TournamentListQuery) {
    const params: unknown[] = [];
    let where = 'WHERE 1=1';

    if (query.status) {
      params.push(query.status);
      where += ` AND t.status = $${params.length}`;
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

  async getById(id: string) {
    const result = await this.pool.query(
      `SELECT t.*,
              (SELECT COUNT(*)::int FROM tournament_registrations tr WHERE tr.tournament_id = t.id) AS registration_count
       FROM tournaments t WHERE t.id = $1`,
      [id]
    );
    if (!result.rows[0]) {
      throw new AppError('NOT_FOUND', 'Tournament not found', 404);
    }
    return mapTournament(result.rows[0]);
  }

  async create(input: CreateTournamentInput) {
    const result = await this.pool.query(
      `INSERT INTO tournaments (name, game, format, start_date, end_date, status, max_players)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.name,
        input.game,
        input.format,
        input.startDate,
        input.endDate,
        input.status ?? 'draft',
        input.maxPlayers ?? null,
      ]
    );
    return mapTournament(result.rows[0]);
  }

  async register(tournamentId: string, userId: string, input: RegisterTournamentInput) {
    const tournament = await this.getById(tournamentId);
    if (tournament.status !== 'open') {
      throw new AppError('CONFLICT', 'Tournament is not open for registration', 409);
    }

    if (tournament.maxPlayers && (tournament.registrationCount ?? 0) >= tournament.maxPlayers) {
      throw new AppError('CONFLICT', 'Tournament is full', 409);
    }

    if (input.bookingId) {
      const booking = await this.pool.query(
        `SELECT id FROM bookings WHERE id = $1 AND user_id = $2 AND status = 'confirmed'`,
        [input.bookingId, userId]
      );
      if (!booking.rows[0]) {
        throw new AppError('BAD_REQUEST', 'Invalid booking for registration', 400);
      }
    }

    const result = await this.pool.query(
      `INSERT INTO tournament_registrations (tournament_id, user_id, booking_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [tournamentId, userId, input.bookingId ?? null]
    );

    if (this.env) {
      await enqueueNotification(this.env, {
        userId,
        type: 'tournament_registered',
        channels: ['in_app', 'email'],
        payload: {
          tournamentId,
          tournamentName: tournament.name,
          startDate: tournament.startDate,
        },
        idempotencyKey: `tournament-reg:${tournamentId}:${userId}`,
      });
    }

    return mapRegistration(result.rows[0]);
  }

  async withdraw(tournamentId: string, userId: string) {
    const result = await this.pool.query(
      `DELETE FROM tournament_registrations
       WHERE tournament_id = $1 AND user_id = $2
       RETURNING *`,
      [tournamentId, userId]
    );
    if (!result.rows[0]) {
      throw new AppError('NOT_FOUND', 'Registration not found', 404);
    }
    return mapRegistration(result.rows[0]);
  }

  async getBracket(tournamentId: string) {
    const tournament = await this.getById(tournamentId);

    const registrations = await this.pool.query(
      `SELECT u.id, u.username, u.skill_tier, tr.registered_at
       FROM tournament_registrations tr
       JOIN users u ON u.id = tr.user_id
       WHERE tr.tournament_id = $1
       ORDER BY u.skill_tier DESC, tr.registered_at ASC`,
      [tournamentId]
    );

    const players = registrations.rows.map((r) => ({
      id: r.id,
      username: r.username,
      skillTier: r.skill_tier,
    }));

    const existingMatches = await this.pool.query(
      `SELECT m.*, u1.username AS p1_username, u1.skill_tier AS p1_skill_tier,
              u2.username AS p2_username, u2.skill_tier AS p2_skill_tier
       FROM matches m
       JOIN users u1 ON u1.id = m.player1_id
       JOIN users u2 ON u2.id = m.player2_id
       WHERE m.tournament_id = $1
       ORDER BY m.created_at ASC`,
      [tournamentId]
    );

    if (existingMatches.rows.length > 0) {
      return {
        tournamentId,
        format: tournament.format,
        rounds: [
          {
            round: 1,
            matches: existingMatches.rows.map((m) => ({
              matchId: m.id,
              player1: { id: m.player1_id, username: m.p1_username, skillTier: m.p1_skill_tier },
              player2: { id: m.player2_id, username: m.p2_username, skillTier: m.p2_skill_tier },
              status: m.status,
            })),
          },
        ],
      };
    }

    const round1Matches = [];
    for (let i = 0; i < players.length; i += 2) {
      round1Matches.push({
        player1: players[i] ?? null,
        player2: players[i + 1] ?? null,
        status: undefined,
      });
    }

    return {
      tournamentId,
      format: tournament.format,
      rounds: [{ round: 1, matches: round1Matches }],
    };
  }
}
