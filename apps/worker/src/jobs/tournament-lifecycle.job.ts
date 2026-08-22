import type { Job } from 'bullmq';
import type { Pool, PoolClient } from 'pg';
import type { Redis } from 'ioredis';
import { emitBroadcast } from '../lib/socket-bridge.js';
import { resolveMatchOutcome, winnerIdFromOutcome } from '@vr-tournament/shared';

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

  await releaseMatchesFromCompletedTournaments(pool);
}

/**
 * A match belonging to a finished tournament must never still be open.
 *
 * Completion expires whatever is unresolved, but a score arriving around that
 * moment can put a match back to `in_progress` — the write commits before the
 * check that would have rejected it, so the match is left open with both
 * innings recorded and no outcome. Nothing revisits it: `close-round` only
 * settles the round it is closing, and that round is already shut.
 *
 * The player pays for it indefinitely. Every "current match" lookup counts that
 * match, so they are treated as mid-game forever: no pairing, no matchmaking,
 * and a dead match card pinned to their screen.
 *
 * So sweep them here. A complete scoreline is decided on its merits — both
 * players batted, the result is not in doubt — and anything else is abandoned.
 */
async function releaseMatchesFromCompletedTournaments(pool: Pool): Promise<void> {
  const stranded = await pool.query(
    `SELECT m.id, m.tournament_id, m.player1_id, m.player2_id, m.result
     FROM matches m
     JOIN tournaments t ON t.id = m.tournament_id
     WHERE t.status = 'completed'
       AND m.status IN ('pending_confirmation', 'confirmed', 'in_progress')`
  );
  if (stranded.rowCount === 0) return;

  for (const match of stranded.rows) {
    const result = (match.result ?? {}) as {
      player1Score?: number | null;
      player2Score?: number | null;
      chaseTarget?: number | null;
      chasePlayerId?: string | null;
    };
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (result.player1Score != null && result.player2Score != null) {
        const outcome = resolveMatchOutcome(
          match.player1_id,
          match.player2_id,
          result.player1Score,
          result.player2Score,
          { chaseTarget: result.chaseTarget ?? null, chasePlayerId: result.chasePlayerId ?? null }
        );
        const winnerId = winnerIdFromOutcome(outcome, match.player1_id, match.player2_id);
        await client.query(
          `UPDATE matches SET status = 'completed', result = $1, updated_at = NOW() WHERE id = $2`,
          [JSON.stringify({ ...result, winnerId, outcome }), match.id]
        );
        if (winnerId) {
          const loserId = winnerId === match.player1_id ? match.player2_id : match.player1_id;
          await client.query(
            `UPDATE tournament_participants SET wins = wins + 1, updated_at = NOW()
             WHERE tournament_id = $1 AND user_id = $2`,
            [match.tournament_id, winnerId]
          );
          await client.query(
            `UPDATE tournament_participants SET losses = losses + 1, updated_at = NOW()
             WHERE tournament_id = $1 AND user_id = $2`,
            [match.tournament_id, loserId]
          );
        }
        console.log(
          `Released stranded match ${match.id} in a completed tournament: ${result.player1Score}-${result.player2Score} (${outcome})`
        );
      } else {
        await client.query(
          `UPDATE matches SET status = 'expired', updated_at = NOW() WHERE id = $1`,
          [match.id]
        );
        console.log(`Expired stranded match ${match.id} in a completed tournament`);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(`Failed to release stranded match ${match.id}:`, err);
    } finally {
      client.release();
    }
  }
}
