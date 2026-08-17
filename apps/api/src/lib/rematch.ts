import type { Pool } from 'pg';
import type { PendingRematch } from '@vr-tournament/shared';

/** Accepts a pool or a checked-out client so callers can run inside a transaction. */
type Queryable = Pick<Pool, 'query'>;

/**
 * Record that two players drew and owe each other a replay.
 *
 * Written in the same transaction that cancels the drawn match, so the pair can
 * never be left with a cancelled match and no instruction to replay it. The
 * unique index on `source_match_id` absorbs a retried resolution: a score
 * submission that fails after the cancel and is replayed must not leave the two
 * owing a second rematch.
 */
export async function openRematch(
  client: Queryable,
  input: {
    tournamentId: string;
    roundNumber: number;
    sourceMatchId: string;
    player1Id: string;
    player2Id: string;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO tournament_rematches
       (tournament_id, round_number, source_match_id, player1_id, player2_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (source_match_id) DO NOTHING`,
    [
      input.tournamentId,
      input.roundNumber,
      input.sourceMatchId,
      input.player1Id,
      input.player2Id,
    ]
  );
}

const PENDING_SELECT = `
  SELECT r.id, r.tournament_id, r.round_number, r.source_match_id,
         r.player1_id, r.player2_id, r.player1_slot_id, r.player2_slot_id,
         u1.username AS p1_username, u2.username AS p2_username
  FROM tournament_rematches r
  JOIN users u1 ON u1.id = r.player1_id
  JOIN users u2 ON u2.id = r.player2_id
`;

interface RematchRow {
  id: string;
  tournament_id: string;
  round_number: number;
  source_match_id: string;
  player1_id: string;
  player2_id: string;
  player1_slot_id: string | null;
  player2_slot_id: string | null;
  p1_username: string | null;
  p2_username: string | null;
}

/** Turn a stored row into the view the player asking for it should see. */
function mapForUser(row: RematchRow, userId: string): PendingRematch {
  const isPlayer1 = row.player1_id === userId;
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    roundNumber: row.round_number,
    sourceMatchId: row.source_match_id,
    opponentId: isPlayer1 ? row.player2_id : row.player1_id,
    opponentName: (isPlayer1 ? row.p2_username : row.p1_username) ?? null,
    hasChosenSlot: (isPlayer1 ? row.player1_slot_id : row.player2_slot_id) !== null,
    opponentHasChosenSlot: (isPlayer1 ? row.player2_slot_id : row.player1_slot_id) !== null,
  };
}

/** The replay this player still owes in this tournament, if any. */
export async function getPendingRematch(
  client: Queryable,
  tournamentId: string,
  userId: string
): Promise<PendingRematch | null> {
  const result = await client.query(
    `${PENDING_SELECT}
     WHERE r.tournament_id = $1
       AND r.status = 'pending'
       AND (r.player1_id = $2 OR r.player2_id = $2)
     ORDER BY r.created_at DESC
     LIMIT 1`,
    [tournamentId, userId]
  );
  const row = result.rows[0] as RematchRow | undefined;
  return row ? mapForUser(row, userId) : null;
}

/**
 * Note that this player has picked their window for the replay.
 *
 * Stored on the rematch rather than inferred from `tournament_round_slots`,
 * because the row they update is the one they already held for this round — the
 * pick that matters is indistinguishable from the one they made before the draw
 * unless it is recorded here. Round close reads exactly this to decide whether
 * an unplayed rematch has one player who did their part.
 */
export async function recordRematchSlot(
  client: Queryable,
  rematchId: string,
  userId: string,
  timeSlotId: string
): Promise<void> {
  await client.query(
    `UPDATE tournament_rematches
     SET player1_slot_id = CASE WHEN player1_id = $2 THEN $3::uuid ELSE player1_slot_id END,
         player2_slot_id = CASE WHEN player2_id = $2 THEN $3::uuid ELSE player2_slot_id END,
         updated_at = NOW()
     WHERE id = $1 AND status = 'pending'`,
    [rematchId, userId, timeSlotId]
  );
}
