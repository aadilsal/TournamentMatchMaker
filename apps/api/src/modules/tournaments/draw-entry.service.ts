import type { Pool, PoolClient } from 'pg';
import type { JoinTournamentInput, PlayerCard } from '@vr-tournament/shared';
import { tournamentLink } from '@vr-tournament/shared';
import type { Env } from '../../config/env.js';
import { AppError } from '../../lib/response.js';
import { enqueueNotification } from '../../lib/bullmq.js';
import { buildPlayerCard } from '../../lib/player-card.js';
import { emitTournamentUpdated } from '../../socket/sync-events.js';

export interface DrawRegistration {
  tournamentId: string;
  playLocation: 'venue' | 'home';
  venue: { id: string; name: string; city: string } | null;
}

/** Where a player is in the guided flow: no tournament yet → choose one; otherwise → my tournaments. */
export interface PlayerJourney {
  step: 'choose_tournament' | 'my_tournaments';
  hasVrHeadset: boolean;
  activeTournamentCount: number;
}

/** Entry for draw-format tournaments: join with a venue or Home, before round 1 starts. No slots, no bookings. */
export class DrawEntryService {
  constructor(
    private pool: Pool,
    private env?: Env
  ) {}

  async join(
    tournamentId: string,
    userId: string,
    input: JoinTournamentInput
  ): Promise<{ registration: DrawRegistration; created: boolean }> {
    const client = await this.pool.connect();
    let created = false;
    let registration: DrawRegistration;
    let tournamentName = '';
    let startDate = '';
    let overs = 1;
    try {
      await client.query('BEGIN');
      const t = await this.lockJoinable(client, tournamentId);
      tournamentName = t.name;
      startDate = (t.start_date as Date).toISOString();
      overs = Number(t.overs ?? 1);

      const user = await client.query(`SELECT has_vr_headset, is_bot FROM users WHERE id = $1`, [userId]);
      if (!user.rows[0] || user.rows[0].is_bot) throw new AppError('NOT_FOUND', 'User not found', 404);

      let venue: DrawRegistration['venue'] = null;
      if (input.home) {
        if (!user.rows[0].has_vr_headset) {
          throw new AppError('BAD_REQUEST', 'Playing from Home needs a VR headset — turn it on in your profile first', 400);
        }
      } else {
        const v = await client.query(`SELECT id, name, city FROM venues WHERE id = $1 AND active = TRUE`, [input.venueId]);
        if (!v.rows[0]) throw new AppError('BAD_REQUEST', 'That venue is not available — pick another', 400);
        venue = { id: v.rows[0].id, name: v.rows[0].name, city: v.rows[0].city ?? '' };
      }

      if (t.max_players) {
        const taken = await client.query(
          `SELECT COUNT(*)::int AS count FROM tournament_registrations r
           JOIN users u ON u.id = r.user_id
           WHERE r.tournament_id = $1 AND r.user_id <> $2 AND u.is_bot = FALSE`,
          [tournamentId, userId]
        );
        if ((taken.rows[0]?.count ?? 0) >= t.max_players) throw new AppError('CONFLICT', 'This tournament is full', 409);
      }

      const playLocation = input.home ? 'home' : 'venue';
      const saved = await client.query(
        `INSERT INTO tournament_registrations (tournament_id, user_id, play_location, venue_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (tournament_id, user_id)
         DO UPDATE SET play_location = EXCLUDED.play_location, venue_id = EXCLUDED.venue_id
         RETURNING (xmax = 0) AS created`,
        [tournamentId, userId, playLocation, venue?.id ?? null]
      );
      created = saved.rows[0]?.created === true;

      await client.query(
        `INSERT INTO tournament_participants (tournament_id, user_id, status, round_number)
         VALUES ($1, $2, 'active', 1)
         ON CONFLICT (tournament_id, user_id) DO UPDATE SET status = 'active', round_number = 1, updated_at = NOW()`,
        [tournamentId, userId]
      );
      await client.query('COMMIT');
      registration = { tournamentId, playLocation, venue };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    await this.broadcast(tournamentId, created ? 'registered' : 'entered');
    if (created && this.env) {
      enqueueNotification(this.env, {
        userId,
        type: 'tournament_registered',
        channels: ['in_app', 'email'],
        payload: {
          tournamentId,
          tournamentName,
          startDate,
          message: `You're in ${tournamentName}! Your first match is drawn when it starts.`,
          link: tournamentLink(tournamentId),
          emailData: { playingAt: registration.venue?.name ?? 'Home', overs },
        },
        idempotencyKey: `tournament-reg:${tournamentId}:${userId}`,
      }).catch((err: unknown) => console.error('Failed to enqueue registration notification:', err));
    }
    return { registration, created };
  }

  /** Leave before round 1 starts; after that the place is fixed. */
  async leave(tournamentId: string, userId: string): Promise<{ left: boolean }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.lockJoinable(client, tournamentId, "You can't leave once the tournament has started");
      const removed = await client.query(
        `DELETE FROM tournament_registrations WHERE tournament_id = $1 AND user_id = $2 RETURNING id`,
        [tournamentId, userId]
      );
      if (!removed.rowCount) throw new AppError('NOT_FOUND', "You're not registered for this tournament", 404);
      await client.query(`DELETE FROM tournament_participants WHERE tournament_id = $1 AND user_id = $2`, [
        tournamentId,
        userId,
      ]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    await this.broadcast(tournamentId, 'withdrawn');
    return { left: true };
  }

  async journey(userId: string): Promise<PlayerJourney> {
    const row = await this.pool.query(
      `SELECT u.has_vr_headset,
              (SELECT COUNT(*)::int FROM tournament_registrations r
                 JOIN tournaments t ON t.id = r.tournament_id
                WHERE r.user_id = u.id AND t.status IN ('open', 'closed', 'in_progress')) AS active_count,
              (SELECT COUNT(*)::int FROM tournaments t
                WHERE t.status = 'open' AND t.play_format = 'draw' AND t.start_date > NOW()
                  AND (t.registration_closes_at IS NULL OR t.registration_closes_at > NOW())
                  AND (t.max_players IS NULL
                       OR (SELECT COUNT(*) FROM tournament_registrations r2 WHERE r2.tournament_id = t.id) < t.max_players)
              ) AS joinable_count
       FROM users u WHERE u.id = $1`,
      [userId]
    );
    if (!row.rows[0]) throw new AppError('NOT_FOUND', 'User not found', 404);
    const activeTournamentCount = Number(row.rows[0].active_count ?? 0);
    // Choosing only makes sense when something is open; otherwise the dashboard is home.
    const joinable = Number(row.rows[0].joinable_count ?? 0);
    return {
      step: activeTournamentCount === 0 && joinable > 0 ? 'choose_tournament' : 'my_tournaments',
      hasVrHeadset: row.rows[0].has_vr_headset === true,
      activeTournamentCount,
    };
  }

  myTournaments(userId: string, timeZone?: string): Promise<PlayerCard> {
    return buildPlayerCard(this.pool, userId, timeZone);
  }

  /** Lock a draw tournament that is still taking players; refuse with a clear reason otherwise. */
  private async lockJoinable(client: PoolClient, tournamentId: string, startedMessage?: string) {
    const result = await client.query(
      `SELECT id, name, status, play_format, start_date, max_players, overs
       FROM tournaments WHERE id = $1 FOR UPDATE`,
      [tournamentId]
    );
    const t = result.rows[0];
    if (!t || t.status === 'draft') throw new AppError('NOT_FOUND', 'Tournament not found', 404);
    if (t.play_format !== 'draw') {
      throw new AppError('CONFLICT', 'This tournament uses the older entry flow and cannot be joined here', 409);
    }
    const started = t.status !== 'open' || new Date(t.start_date).getTime() <= Date.now();
    if (started) {
      throw new AppError('CONFLICT', startedMessage ?? 'Registration has closed — this tournament has started', 409);
    }
    return t;
  }

  private async broadcast(tournamentId: string, reason: 'registered' | 'entered' | 'withdrawn') {
    try {
      const count = await this.pool.query(
        `SELECT COUNT(*)::int AS count FROM tournament_registrations r
         JOIN users u ON u.id = r.user_id WHERE r.tournament_id = $1 AND u.is_bot = FALSE`,
        [tournamentId]
      );
      emitTournamentUpdated({ tournamentId, reason, registrationCount: count.rows[0]?.count ?? 0 });
    } catch (err) {
      console.error('Failed to broadcast tournament update:', err);
    }
  }
}
