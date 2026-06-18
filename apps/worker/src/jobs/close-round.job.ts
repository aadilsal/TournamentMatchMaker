import type { Job } from 'bullmq';
import type { Pool } from 'pg';
import { KNOCKOUT_ROUNDS, playersToAdvance, shouldStartKnockout } from '@vr-tournament/shared';

export async function processCloseRoundJob(_job: Job, pool: Pool) {
  const expired = await pool.query(
    `SELECT tr.tournament_id, tr.round_number
     FROM tournament_rounds tr
     JOIN tournaments t ON t.id = tr.tournament_id
     WHERE tr.status = 'active' AND tr.ends_at < NOW() AND t.phase = 'normal'`
  );

  for (const round of expired.rows) {
    await closeRound(pool, round.tournament_id, round.round_number);
  }
}

async function closeRound(pool: Pool, tournamentId: string, roundNumber: number) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const roundResult = await client.query(
      `SELECT * FROM tournament_rounds
       WHERE tournament_id = $1 AND round_number = $2 AND status = 'active'
       FOR UPDATE`,
      [tournamentId, roundNumber]
    );
    if (!roundResult.rows[0]) {
      await client.query('ROLLBACK');
      return;
    }

    await client.query(
      `UPDATE tournament_rounds SET status = 'closed' WHERE tournament_id = $1 AND round_number = $2`,
      [tournamentId, roundNumber]
    );

    const activeResult = await client.query(
      `SELECT tp.*, tr.registered_at FROM tournament_participants tp
       JOIN tournament_registrations tr ON tr.tournament_id = tp.tournament_id AND tr.user_id = tp.user_id
       WHERE tp.tournament_id = $1 AND tp.status IN ('active', 'advanced')
       ORDER BY tp.wins DESC, tp.losses ASC, tr.registered_at ASC`,
      [tournamentId]
    );

    const active = activeResult.rows;
    const activeCount = active.length;

    if (shouldStartKnockout(activeCount)) {
      const sorted = active.slice(0, 16);
      for (const p of sorted) {
        await client.query(
          `UPDATE tournament_participants SET status = 'knockout', updated_at = NOW()
           WHERE tournament_id = $1 AND user_id = $2`,
          [tournamentId, p.user_id]
        );
      }
      for (let slot = 0; slot < 8; slot++) {
        const p1 = sorted[slot * 2]?.user_id;
        const p2 = sorted[slot * 2 + 1]?.user_id;
        if (!p1 || !p2) continue;
        await client.query(
          `INSERT INTO matches (tournament_id, player1_id, player2_id, status, round_number, phase, bracket_slot)
           VALUES ($1, $2, $3, 'pending_confirmation', $4, 'knockout', $5)`,
          [tournamentId, p1, p2, KNOCKOUT_ROUNDS.ro16, slot]
        );
      }
      await client.query(
        `UPDATE tournaments SET phase = 'knockout', updated_at = NOW() WHERE id = $1`,
        [tournamentId]
      );
    } else {
      const keepCount = playersToAdvance(activeCount);
      const advancing = active.slice(0, keepCount);
      const eliminated = active.slice(keepCount);

      for (const p of advancing) {
        await client.query(
          `UPDATE tournament_participants SET status = 'active', round_number = $1, updated_at = NOW()
           WHERE id = $2`,
          [roundNumber + 1, p.id]
        );
      }
      for (const p of eliminated) {
        await client.query(
          `UPDATE tournament_participants SET status = 'out', updated_at = NOW() WHERE id = $1`,
          [p.id]
        );
      }

      const nextStarts = new Date();
      const nextEnds = new Date(nextStarts);
      nextEnds.setDate(nextEnds.getDate() + 3);

      await client.query(
        `INSERT INTO tournament_rounds (tournament_id, round_number, starts_at, ends_at, status)
         VALUES ($1, $2, $3, $4, 'active')`,
        [tournamentId, roundNumber + 1, nextStarts, nextEnds]
      );

      await client.query(
        `UPDATE tournaments SET current_round_number = $1, updated_at = NOW() WHERE id = $2`,
        [roundNumber + 1, tournamentId]
      );
    }

    await client.query('COMMIT');
    console.log(`Closed round ${roundNumber} for tournament ${tournamentId}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
