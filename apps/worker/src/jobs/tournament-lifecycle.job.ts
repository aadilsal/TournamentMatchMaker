import type { Job } from 'bullmq';
import type { Pool, PoolClient } from 'pg';
import type { Redis } from 'ioredis';
import { emitBroadcast } from '../lib/socket-bridge.js';

/**
 * Drives a tournament through its lifecycle on its own schedule:
 *
 *   open        -> closed        when registration_closes_at passes
 *   closed      -> in_progress   when start_date passes
 *   in_progress -> completed     when end_date passes
 *
 * Publishing stays manual — a draft is a working state and should not reach
 * players until an admin says so. Every automatic step is one an admin can also
 * take early by hand; this only guarantees it happens if nobody does.
 *
 * Before this existed, only an admin could move a tournament forward, so one
 * left alone stalled: `close-round` skips anything that is not `in_progress`,
 * so its rounds never advanced and its players were never paired.
 */

interface Transition {
  from: string;
  to: string;
  /** SQL predicate selecting tournaments due for this transition. */
  due: string;
  reason: 'status_changed';
  apply?: (client: PoolClient, tournamentId: string) => Promise<void>;
  describe: (name: string) => string;
}

const TRANSITIONS: Transition[] = [
  {
    from: 'open',
    to: 'closed',
    due: `registration_closes_at IS NOT NULL AND registration_closes_at <= NOW()`,
    reason: 'status_changed',
    describe: (name) => `Registration closed for "${name}"`,
  },
  {
    from: 'closed',
    to: 'in_progress',
    due: `start_date <= NOW()`,
    reason: 'status_changed',
    apply: async (client, tournamentId) => {
      // Fix the field size the knockout threshold is measured against, exactly
      // as the admin Start action does.
      const count = await client.query(
        `SELECT COUNT(*)::int AS count FROM tournament_registrations WHERE tournament_id = $1`,
        [tournamentId]
      );
      await client.query(
        `UPDATE tournaments
         SET initial_player_count = COALESCE(initial_player_count, NULLIF($2::int, 0))
         WHERE id = $1`,
        [tournamentId, count.rows[0]?.count ?? 0]
      );
    },
    describe: (name) => `Started "${name}"`,
  },
  {
    from: 'in_progress',
    to: 'completed',
    due: `end_date <= NOW()`,
    reason: 'status_changed',
    apply: async (client, tournamentId) => {
      // The end date is a hard stop. Anything still unresolved is settled here
      // so the tournament cannot hang open — and, critically, so its players are
      // released to enter another one.
      await client.query(
        `UPDATE matches SET status = 'expired', updated_at = NOW()
         WHERE tournament_id = $1
           AND status IN ('pending_confirmation', 'confirmed', 'in_progress')`,
        [tournamentId]
      );
      await client.query(`UPDATE tournaments SET phase = 'completed' WHERE id = $1`, [tournamentId]);
      await client.query(
        `UPDATE tournament_rounds SET status = 'closed'
         WHERE tournament_id = $1 AND status = 'active'`,
        [tournamentId]
      );
      await client.query(
        `UPDATE tournament_participants SET status = 'out', updated_at = NOW()
         WHERE tournament_id = $1 AND status <> 'out'`,
        [tournamentId]
      );
    },
    describe: (name) => `Completed "${name}" (end date reached)`,
  },
];

export async function processTournamentLifecycleJob(
  _job: Job,
  pool: Pool,
  redis: Redis
): Promise<void> {
  for (const transition of TRANSITIONS) {
    const due = await pool.query(
      `SELECT id, name FROM tournaments WHERE status = $1 AND ${transition.due}`,
      [transition.from]
    );

    for (const tournament of due.rows) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Re-read under a lock: an admin may have moved this tournament by hand
        // between the scan and now, and applying a stale transition would undo
        // their action.
        const locked = await client.query(`SELECT status FROM tournaments WHERE id = $1 FOR UPDATE`, [
          tournament.id,
        ]);
        if (locked.rows[0]?.status !== transition.from) {
          await client.query('ROLLBACK');
          continue;
        }

        await client.query(`UPDATE tournaments SET status = $2, updated_at = NOW() WHERE id = $1`, [
          tournament.id,
          transition.to,
        ]);
        await transition.apply?.(client, tournament.id);

        await client.query('COMMIT');
        console.log(transition.describe(tournament.name));

        // The change happened inside the worker, so nothing has told the
        // browsers watching it.
        await emitBroadcast(redis, 'tournament:updated', {
          tournamentId: tournament.id,
          reason: transition.reason,
        });
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(
          `Lifecycle ${transition.from} -> ${transition.to} failed for ${tournament.id}:`,
          err
        );
      } finally {
        client.release();
      }
    }
  }
}
