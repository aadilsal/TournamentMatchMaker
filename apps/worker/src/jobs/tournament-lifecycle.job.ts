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

/**
 * Put the opening round's window back where the tournament's own dates say it
 * should be, at the moment play begins.
 *
 * Round 1 is written when the tournament is *created*, from the start date it
 * had then, and nothing rewrote it afterwards. Move the start date — which is
 * ordinary while a tournament is still being set up — and the round kept the
 * old window. Two things follow, both silent: the slot picker offers nothing,
 * because it only offers slots inside the round, so no player can enter; and if
 * the stale window has already elapsed by the time play begins, `close-round`
 * shuts round 1 on its first sweep and eliminates half a field that never got
 * to play a single match.
 *
 * Only ever applied to a round nobody has played in yet, so a real round in
 * progress can never be moved out from under its matches.
 */
async function alignOpeningRound(client: PoolClient, tournamentId: string): Promise<void> {
  const result = await client.query(
    `UPDATE tournament_rounds tr
     SET starts_at = aligned.starts_at,
         ends_at   = aligned.ends_at
     FROM tournaments t
     CROSS JOIN LATERAL (
       SELECT CASE
                WHEN t.start_date + make_interval(mins => t.round_duration_minutes) > NOW()
                THEN t.start_date
                ELSE NOW()
              END AS starts_at
     ) base
     CROSS JOIN LATERAL (
       SELECT base.starts_at,
              base.starts_at + make_interval(mins => t.round_duration_minutes) AS ends_at
     ) aligned
     WHERE t.id = $1
       AND tr.tournament_id = t.id
       AND tr.round_number = t.current_round_number
       AND tr.status = 'active'
       AND (tr.starts_at <> aligned.starts_at OR tr.ends_at <> aligned.ends_at)
       AND NOT EXISTS (
         SELECT 1 FROM matches m
         WHERE m.tournament_id = t.id AND m.round_number = tr.round_number
       )
     RETURNING tr.round_number, tr.starts_at, tr.ends_at`,
    [tournamentId]
  );

  const row = result.rows[0];
  if (row) {
    console.log(
      `Realigned round ${row.round_number} of ${tournamentId} to ${new Date(row.starts_at).toISOString()} – ${new Date(row.ends_at).toISOString()}`
    );
  }
}

const TRANSITIONS: Transition[] = [
  {
    from: 'open',
    to: 'closed',
    // Play beginning shuts registration whatever the window says. A tournament
    // whose `registration_closes_at` was cleared by hand had no way out of
    // 'open' at all, so it never reached 'in_progress' and never ran.
    due: `(registration_closes_at IS NOT NULL AND registration_closes_at <= NOW()) OR start_date <= NOW()`,
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
      await alignOpeningRound(client, tournamentId);
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
