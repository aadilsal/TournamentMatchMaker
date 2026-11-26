import type { Job } from 'bullmq';
import type { Pool, PoolClient } from 'pg';
import type { Redis } from 'ioredis';
import {
  DRAW_PHASE,
  STARTING_SOON_MS,
  drawLostNotice,
  drawRound,
  drawRoundLabel,
  drawWonNotice,
  roundClosingSoonNotice,
  roundStartedNotice,
  roundsRemaining,
  settleDrawMatch,
  tournamentLink,
  tournamentStartingSoonNotice,
  type DrawPairing,
} from '@vr-tournament/shared';
import { ensureTournamentBot } from '../lib/bot-opponent.js';
import { emitBroadcast, emitToUser } from '../lib/socket-bridge.js';

type NotificationQueue = {
  add: (name: string, data: unknown, opts?: { jobId?: string }) => Promise<unknown>;
};

/** Side effects collected inside a transaction and sent only after it commits. */
interface Outbox {
  newMatches: Array<{ matchId: string; player1Id: string; player2Id: string }>;
  decided: Array<{ matchId: string; winnerId: string; loserId: string }>;
  finished: Array<{ tournamentId: string; name: string; championId: string | null; playerIds: string[] }>;
  touched: Set<string>;
}

const emptyOutbox = (): Outbox => ({ newMatches: [], decided: [], finished: [], touched: new Set() });

/**
 * A round is due to close at its deadline, or earlier once every match in it is decided —
 * except round 1 with buybacks on (and not the final), which keeps its window for buybacks. Uses aliases t, tr.
 */
const ROUND_DUE_SQL = `(
  tr.ends_at <= NOW()
  OR (
    EXISTS (SELECT 1 FROM matches dm WHERE dm.tournament_id = t.id AND dm.round_number = tr.round_number AND dm.phase = 'draw')
    AND NOT EXISTS (
      SELECT 1 FROM matches om
      WHERE om.tournament_id = t.id AND om.round_number = tr.round_number AND om.phase = 'draw'
        AND om.status IN ('pending_confirmation', 'confirmed', 'in_progress')
    )
    AND NOT (tr.round_number = 1 AND t.buyback_price_cents >= 50
             AND (SELECT COUNT(*) FROM matches r1 WHERE r1.tournament_id = t.id AND r1.round_number = 1 AND r1.phase = 'draw') > 1)
  )
)`;

/** Draw-format engine: start tournaments at their start time, close rounds at their deadline, draw the next. */
export async function processDrawRoundsJob(
  _job: Job | null,
  pool: Pool,
  redis: Redis,
  notificationQueue: NotificationQueue
): Promise<void> {
  const outbox = emptyOutbox();
  await sendDrawReminders(pool, notificationQueue).catch((err) => console.error('[draw-rounds] reminders failed:', err));

  const starting = await pool.query(
    `SELECT id FROM tournaments
     WHERE play_format = 'draw' AND status = 'open' AND start_date <= NOW()`
  );
  for (const row of starting.rows) {
    await inTransaction(pool, outbox, (client, box) => startTournament(client, row.id as string, box));
  }

  const closing = await pool.query(
    `SELECT t.id
     FROM tournaments t
     JOIN tournament_rounds tr ON tr.tournament_id = t.id AND tr.round_number = t.current_round_number
     WHERE t.play_format = 'draw' AND t.status = 'in_progress'
       AND tr.status = 'active' AND ${ROUND_DUE_SQL}`
  );
  for (const row of closing.rows) {
    await inTransaction(pool, outbox, (client, box) => closeRound(client, row.id as string, box));
  }

  await flushOutbox(pool, redis, notificationQueue, outbox);
}

/** Runs one tournament's step; its side effects reach the outbox only if it commits. */
async function inTransaction(
  pool: Pool,
  outbox: Outbox,
  work: (client: PoolClient, box: Outbox) => Promise<void>
): Promise<void> {
  const box = emptyOutbox();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await work(client, box);
    await client.query('COMMIT');
    outbox.newMatches.push(...box.newMatches);
    outbox.decided.push(...box.decided);
    outbox.finished.push(...box.finished);
    box.touched.forEach((id) => outbox.touched.add(id));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[draw-rounds] transaction failed:', err);
  } finally {
    client.release();
  }
}

/** Lock the tournament row; null when another run holds it or it moved on. */
async function lockTournament(client: PoolClient, tournamentId: string, status: string) {
  const locked = await client.query(
    `SELECT id, name, status, start_date, round_duration_minutes, current_round_number
     FROM tournaments
     WHERE id = $1 AND play_format = 'draw' AND status = $2
     FOR UPDATE SKIP LOCKED`,
    [tournamentId, status]
  );
  return locked.rows[0] ?? null;
}

async function startTournament(client: PoolClient, tournamentId: string, outbox: Outbox): Promise<void> {
  const t = await lockTournament(client, tournamentId, 'open');
  if (!t) return;

  const field = await humanField(client, tournamentId, 1);
  await client.query(
    `UPDATE tournaments SET initial_player_count = $2, updated_at = NOW() WHERE id = $1`,
    [tournamentId, field.length]
  );

  if (field.length < 2) {
    await finishTournament(client, t, field[0]?.userId ?? null, outbox);
    return;
  }

  // The real field is known now, so replace the creation-time estimate of the finish.
  await client.query(
    `UPDATE tournaments SET status = 'in_progress', phase = $2, current_round_number = 1,
            end_date = NOW() + make_interval(mins => $3), updated_at = NOW()
     WHERE id = $1`,
    [tournamentId, DRAW_PHASE, roundsRemaining(field.length) * Number(t.round_duration_minutes)]
  );
  await openRound(client, tournamentId, 1, Number(t.round_duration_minutes), null, field, outbox);
  outbox.touched.add(tournamentId);
  console.log(`[draw-rounds] started "${t.name}" with ${field.length} players`);
}

async function closeRound(client: PoolClient, tournamentId: string, outbox: Outbox): Promise<void> {
  const t = await lockTournament(client, tournamentId, 'in_progress');
  if (!t) return;
  const roundNumber = Number(t.current_round_number);

  const round = await client.query(
    `SELECT tr.ends_at FROM tournament_rounds tr
     JOIN tournaments t ON t.id = tr.tournament_id
     WHERE tr.tournament_id = $1 AND tr.round_number = $2 AND tr.status = 'active' AND ${ROUND_DUE_SQL}`,
    [tournamentId, roundNumber]
  );
  if (!round.rows[0]) return;

  await settleOpenDrawMatches(client, tournamentId, roundNumber, outbox);

  // The buyback window closes with the round; bots never carry forward.
  await client.query(
    `UPDATE tournament_participants tp SET status = 'out', updated_at = NOW()
     FROM users u
     WHERE u.id = tp.user_id AND tp.tournament_id = $1
       AND (u.is_bot OR tp.status = 'eliminated'
            OR (tp.status IN ('active', 'advanced') AND tp.round_number <= $2))`,
    [tournamentId, roundNumber]
  );
  await client.query(
    `UPDATE tournament_rounds SET status = 'closed' WHERE tournament_id = $1 AND round_number = $2`,
    [tournamentId, roundNumber]
  );

  const field = await humanField(client, tournamentId, roundNumber + 1);
  if (field.length < 2) {
    await finishTournament(client, t, field[0]?.userId ?? null, outbox);
    return;
  }

  await client.query(
    `UPDATE tournaments SET current_round_number = $2, updated_at = NOW() WHERE id = $1`,
    [tournamentId, roundNumber + 1]
  );
  await openRound(
    client,
    tournamentId,
    roundNumber + 1,
    Number(t.round_duration_minutes),
    new Date(round.rows[0].ends_at),
    field,
    outbox
  );
  outbox.touched.add(tournamentId);
}

/** Humans still in the tournament for this round, with the rating the draw seeds by. */
async function humanField(client: PoolClient, tournamentId: string, roundNumber: number) {
  const rows = await client.query(
    `SELECT tp.user_id, u.rating_points
     FROM tournament_participants tp
     JOIN users u ON u.id = tp.user_id
     WHERE tp.tournament_id = $1 AND tp.round_number = $2
       AND tp.status IN ('active', 'advanced') AND u.is_bot = FALSE`,
    [tournamentId, roundNumber]
  );
  return rows.rows.map((r) => ({ userId: r.user_id as string, rating: Number(r.rating_points ?? 0) }));
}

async function openRound(
  client: PoolClient,
  tournamentId: string,
  roundNumber: number,
  roundMinutes: number,
  previousEnd: Date | null,
  field: Array<{ userId: string; rating: number }>,
  outbox: Outbox
): Promise<void> {
  // Keep to the published schedule, but never open a round with less than half its length left.
  const now = Date.now();
  const lengthMs = roundMinutes * 60_000;
  const scheduledEnd = (previousEnd ? previousEnd.getTime() : now) + lengthMs;
  const endsAt = new Date(Math.max(scheduledEnd, now + lengthMs / 2));

  await client.query(
    `INSERT INTO tournament_rounds (tournament_id, round_number, starts_at, ends_at, status)
     VALUES ($1, $2, NOW(), $3, 'active')
     ON CONFLICT (tournament_id, round_number)
     DO UPDATE SET starts_at = NOW(), ends_at = EXCLUDED.ends_at, status = 'active'`,
    [tournamentId, roundNumber, endsAt]
  );

  const pairings = drawRound(field);
  const venues = await client.query(
    `SELECT user_id, venue_id FROM tournament_registrations
     WHERE tournament_id = $1 AND play_location = 'venue'`,
    [tournamentId]
  );
  const venueOf = new Map<string, string>(venues.rows.map((r) => [r.user_id as string, r.venue_id as string]));
  const label = drawRoundLabel(field.length, roundNumber);

  for (const pairing of pairings) {
    await createDrawMatch(client, tournamentId, roundNumber, pairing, venueOf, label, outbox);
  }
}

async function createDrawMatch(
  client: PoolClient,
  tournamentId: string,
  roundNumber: number,
  pairing: DrawPairing,
  venueOf: Map<string, string>,
  roundLabel: string,
  outbox: Outbox
): Promise<void> {
  const player2Id = pairing.player2Id ?? (await ensureTournamentBot(client, tournamentId, roundNumber));
  const venueId = venueOf.get(pairing.player1Id) ?? venueOf.get(player2Id) ?? null;
  const result = {
    player1Score: null,
    player2Score: null,
    winnerId: null,
    chaseTarget: null,
    chasePlayerId: null,
    versusBot: pairing.player2Id === null,
    roundLabel,
    source: 'meta',
  };

  const inserted = await client.query(
    `INSERT INTO matches (tournament_id, player1_id, player2_id, venue_id, status, scheduled_at,
                          round_number, phase, bracket_slot, result)
     VALUES ($1, $2, $3, $4, 'confirmed', NOW(), $5, $6, $7, $8)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [tournamentId, pairing.player1Id, player2Id, venueId, roundNumber, DRAW_PHASE, pairing.slot, JSON.stringify(result)]
  );
  if (!inserted.rows[0]) return;
  outbox.newMatches.push({ matchId: inserted.rows[0].id, player1Id: pairing.player1Id, player2Id });
}

/** Decide every match still open when its round closes; see `settleDrawMatch` for the rules. */
async function settleOpenDrawMatches(
  client: PoolClient,
  tournamentId: string,
  roundNumber: number,
  outbox: Outbox
): Promise<void> {
  const open = await client.query(
    `SELECT id, player1_id, player2_id, result
     FROM matches
     WHERE tournament_id = $1 AND round_number = $2 AND phase = $3
       AND status IN ('pending_confirmation', 'confirmed', 'in_progress')
     FOR UPDATE`,
    [tournamentId, roundNumber, DRAW_PHASE]
  );

  for (const match of open.rows) {
    // A started innings with no score by the close counts as 0.
    await client.query(
      `INSERT INTO match_innings (match_id, user_id, score, source)
       SELECT a.match_id, a.user_id, 0, 'abandoned' FROM innings_attempts a
       WHERE a.match_id = $1
         AND NOT EXISTS (SELECT 1 FROM match_innings mi WHERE mi.match_id = a.match_id AND mi.user_id = a.user_id)
       ON CONFLICT DO NOTHING`,
      [match.id]
    );
    const innings = await client.query(
      `SELECT user_id, score FROM match_innings WHERE match_id = $1 ORDER BY played_at ASC`,
      [match.id]
    );
    const scoreOf = new Map<string, number>(innings.rows.map((r) => [r.user_id as string, Number(r.score)]));
    const result = (match.result ?? {}) as Record<string, unknown>;
    const player1Score = scoreOf.get(match.player1_id) ?? null;
    const player2Score = scoreOf.get(match.player2_id) ?? null;

    const winnerId = settleDrawMatch({
      player1Id: match.player1_id,
      player2Id: match.player2_id,
      player1Score,
      player2Score,
      firstBatterId: innings.rows.length === 2 ? (innings.rows[0].user_id as string) : null,
      tiedFirstBatterId: (result.tiedFirstBatterId as string | undefined) ?? null,
    });

    if (!winnerId) {
      await client.query(
        `UPDATE matches SET status = 'expired', active_player_id = NULL, updated_at = NOW() WHERE id = $1`,
        [match.id]
      );
      continue;
    }

    const loserId = winnerId === match.player1_id ? match.player2_id : match.player1_id;
    await client.query(
      `UPDATE matches SET status = 'completed', active_player_id = NULL, result = $2, updated_at = NOW()
       WHERE id = $1`,
      [
        match.id,
        JSON.stringify({
          ...result,
          player1Score,
          player2Score,
          winnerId,
          outcome: 'win',
          walkover: player1Score == null || player2Score == null,
        }),
      ]
    );
    await recordDrawResult(client, tournamentId, roundNumber, winnerId, loserId);
    outbox.decided.push({ matchId: match.id, winnerId, loserId });
  }
}

/** Winner moves to the next round; loser is knocked out. Bots are skipped. */
export async function recordDrawResult(
  client: PoolClient,
  tournamentId: string,
  roundNumber: number,
  winnerId: string,
  loserId: string
): Promise<void> {
  await client.query(
    `UPDATE tournament_participants tp
     SET wins = wins + 1, round_number = $3 + 1, status = 'active', updated_at = NOW()
     FROM users u
     WHERE u.id = tp.user_id AND u.is_bot = FALSE
       AND tp.tournament_id = $1 AND tp.user_id = $2 AND tp.round_number = $3`,
    [tournamentId, winnerId, roundNumber]
  );
  await client.query(
    `UPDATE tournament_participants tp
     SET losses = losses + 1, status = 'eliminated', updated_at = NOW()
     FROM users u
     WHERE u.id = tp.user_id AND u.is_bot = FALSE
       AND tp.tournament_id = $1 AND tp.user_id = $2 AND tp.round_number = $3`,
    [tournamentId, loserId, roundNumber]
  );
}

async function finishTournament(
  client: PoolClient,
  t: { id: string; name: string },
  championId: string | null,
  outbox: Outbox
): Promise<void> {
  const players = await client.query(
    `SELECT tp.user_id FROM tournament_participants tp
     JOIN users u ON u.id = tp.user_id
     WHERE tp.tournament_id = $1 AND u.is_bot = FALSE`,
    [t.id]
  );
  await client.query(
    `UPDATE tournament_participants SET status = 'out', updated_at = NOW()
     WHERE tournament_id = $1 AND status <> 'out'`,
    [t.id]
  );
  await client.query(
    `UPDATE tournament_rounds SET status = 'closed' WHERE tournament_id = $1 AND status = 'active'`,
    [t.id]
  );
  await client.query(
    `UPDATE tournaments SET status = 'completed', phase = $3, champion_id = $2,
            end_date = LEAST(end_date, NOW()), updated_at = NOW()
     WHERE id = $1`,
    [t.id, championId, DRAW_PHASE]
  );
  outbox.finished.push({
    tournamentId: t.id,
    name: t.name,
    championId,
    playerIds: players.rows.map((r) => r.user_id as string),
  });
  outbox.touched.add(t.id);
  console.log(`[draw-rounds] finished "${t.name}" — champion ${championId ?? 'none'}`);
}

type Send = (userId: string, type: string, payload: Record<string, unknown>, key: string, email?: boolean) => Promise<void>;

const sender = (notificationQueue: NotificationQueue, isBot: Set<string>): Send => async (userId, type, payload, key, email = false) => {
  if (isBot.has(userId)) return;
  await notificationQueue
    .add(
      'dispatch',
      { userId, type, channels: email ? ['in_app', 'email'] : ['in_app'], payload, idempotencyKey: key },
      { jobId: key.replace(/:/g, '~') }
    )
    .catch((err) => console.error('[draw-rounds] notification failed:', err));
};

/** Names, places, scores and the round deadline for one draw match, for notification copy. */
async function matchDetails(pool: Pool, matchId: string) {
  const r = await pool.query(
    `SELECT m.id, m.tournament_id, m.player1_id, m.player2_id, m.result, t.name AS tournament_name, t.overs, tr.ends_at,
            u1.username AS p1_name, u2.username AS p2_name,
            CASE WHEN r1.play_location = 'venue' THEN v1.name END AS p1_place,
            CASE WHEN r2.play_location = 'venue' THEN v2.name END AS p2_place
     FROM matches m
     JOIN tournaments t ON t.id = m.tournament_id
     LEFT JOIN tournament_rounds tr ON tr.tournament_id = m.tournament_id AND tr.round_number = m.round_number
     JOIN users u1 ON u1.id = m.player1_id
     JOIN users u2 ON u2.id = m.player2_id
     LEFT JOIN tournament_registrations r1 ON r1.tournament_id = m.tournament_id AND r1.user_id = m.player1_id
     LEFT JOIN venues v1 ON v1.id = r1.venue_id
     LEFT JOIN tournament_registrations r2 ON r2.tournament_id = m.tournament_id AND r2.user_id = m.player2_id
     LEFT JOIN venues v2 ON v2.id = r2.venue_id
     WHERE m.id = $1`,
    [matchId]
  );
  const row = r.rows[0];
  if (!row) return null;
  const result = (row.result ?? {}) as Record<string, unknown>;
  const side = (id: string) => {
    const isP1 = id === row.player1_id;
    return {
      opponent: (isP1 ? row.p2_name : row.p1_name) as string,
      place: ((isP1 ? row.p1_place : row.p2_place) as string | null) ?? null,
      myScore: ((isP1 ? result.player1Score : result.player2Score) as number | null) ?? null,
      opponentScore: ((isP1 ? result.player2Score : result.player1Score) as number | null) ?? null,
    };
  };
  return {
    tournamentId: row.tournament_id as string,
    tournamentName: row.tournament_name as string,
    roundLabel: (result.roundLabel as string | undefined) ?? 'match',
    overs: Number(row.overs ?? 1),
    closesAt: row.ends_at as Date,
    walkover: result.walkover === true,
    side,
  };
}

async function flushOutbox(
  pool: Pool,
  redis: Redis,
  notificationQueue: NotificationQueue,
  outbox: Outbox
): Promise<void> {
  const ids = [
    ...outbox.newMatches.flatMap((m) => [m.player1Id, m.player2Id]),
    ...outbox.decided.flatMap((d) => [d.winnerId, d.loserId]),
    ...outbox.finished.flatMap((f) => f.playerIds),
  ];
  if (ids.length === 0 && outbox.touched.size === 0) return;

  const bots = await pool.query(`SELECT id FROM users WHERE id = ANY($1) AND is_bot = TRUE`, [ids]);
  const isBot = new Set<string>(bots.rows.map((r) => r.id as string));
  const send = sender(notificationQueue, isBot);

  for (const m of outbox.newMatches) {
    const d = await matchDetails(pool, m.matchId);
    if (!d) continue;
    for (const playerId of [m.player1Id, m.player2Id]) {
      if (isBot.has(playerId)) continue;
      const me = d.side(playerId);
      const notice = roundStartedNotice({
        tournamentName: d.tournamentName,
        roundLabel: d.roundLabel,
        opponent: me.opponent,
        closesAt: d.closesAt,
        playingAt: me.place,
      });
      await emitToUser(redis, playerId, 'match:found', { matchId: m.matchId, autoConfirmed: true });
      await send(
        playerId,
        'round_started',
        {
          ...notice,
          matchId: m.matchId,
          tournamentId: d.tournamentId,
          opponent: me.opponent,
          link: tournamentLink(d.tournamentId),
          emailData: { tournamentName: d.tournamentName, roundLabel: d.roundLabel, opponent: me.opponent, closesAt: d.closesAt, playingAt: me.place, overs: d.overs },
        },
        `round-started:${m.matchId}:${playerId}`,
        true
      );
    }
  }

  for (const decided of outbox.decided) {
    const d = await matchDetails(pool, decided.matchId);
    if (!d) continue;
    const base = { matchId: decided.matchId, tournamentId: d.tournamentId, link: tournamentLink(d.tournamentId) };
    const winner = d.side(decided.winnerId);
    const loser = d.side(decided.loserId);
    await emitToUser(redis, decided.winnerId, 'match:updated', { matchId: decided.matchId, status: 'completed' });
    await emitToUser(redis, decided.loserId, 'match:updated', { matchId: decided.matchId, status: 'completed' });
    await send(
      decided.winnerId,
      'match_won',
      {
        ...base,
        ...drawWonNotice({
          tournamentName: d.tournamentName,
          roundLabel: d.roundLabel,
          opponent: winner.opponent,
          myScore: winner.myScore,
          opponentScore: winner.opponentScore,
          walkover: d.walkover,
          isFinal: d.roundLabel === 'Final',
          nextDrawAt: null,
        }),
      },
      `match_won:${decided.matchId}:${decided.winnerId}`
    );
    await send(
      decided.loserId,
      'match_lost',
      {
        ...base,
        ...drawLostNotice({
          tournamentName: d.tournamentName,
          roundLabel: d.roundLabel,
          opponent: loser.opponent,
          myScore: loser.myScore,
          opponentScore: loser.opponentScore,
          walkover: d.walkover,
          buyback: null,
        }),
      },
      `match_lost:${decided.matchId}:${decided.loserId}`
    );
  }

  for (const f of outbox.finished) {
    const champion = f.championId
      ? (await pool.query(`SELECT username FROM users WHERE id = $1`, [f.championId])).rows[0]?.username
      : null;
    for (const userId of f.playerIds) {
      const isChampion = userId === f.championId;
      const message = isChampion
        ? `You won ${f.name}! 🏆 Congratulations, champion.`
        : champion
          ? `${f.name} is over — ${champion} is the champion. Thanks for playing!`
          : `${f.name} has finished. Thanks for playing!`;
      await send(
        userId,
        'tournament_finished',
        {
          title: isChampion ? `You won ${f.name}! 🏆` : `${f.name} has finished`,
          message,
          tournamentId: f.tournamentId,
          link: tournamentLink(f.tournamentId),
          emailData: { tournamentName: f.name, champion: isChampion },
        },
        `tournament-finished:${f.tournamentId}:${userId}`,
        isChampion
      );
    }
  }

  for (const tournamentId of outbox.touched) {
    await emitBroadcast(redis, 'tournament:updated', { tournamentId, reason: 'status_changed' }).catch(() => {});
  }
}

/** Once-only reminders: tournament starting within the hour, and round closing soon for players yet to bat. */
export async function sendDrawReminders(pool: Pool, notificationQueue: NotificationQueue): Promise<void> {
  const send = sender(notificationQueue, new Set());

  const starting = await pool.query(
    `SELECT t.id, t.name, t.start_date, r.user_id
     FROM tournaments t
     JOIN tournament_registrations r ON r.tournament_id = t.id
     JOIN users u ON u.id = r.user_id AND u.is_bot = FALSE
     WHERE t.play_format = 'draw' AND t.status = 'open'
       AND t.start_date > NOW() AND t.start_date <= NOW() + ($1::bigint * INTERVAL '1 millisecond')
       AND NOT EXISTS (
         SELECT 1 FROM notifications n
         WHERE n.user_id = r.user_id AND n.idempotency_key = 'tournament-starting:' || t.id || ':' || r.user_id || ':in_app'
       )`,
    [STARTING_SOON_MS]
  );
  for (const row of starting.rows) {
    await send(
      row.user_id,
      'tournament_starting_soon',
      {
        ...tournamentStartingSoonNotice({ tournamentName: row.name, startsAt: row.start_date }),
        tournamentId: row.id,
        link: tournamentLink(row.id),
        emailData: { tournamentName: row.name, startsAt: row.start_date },
      },
      `tournament-starting:${row.id}:${row.user_id}`,
      true
    );
  }

  // Reminder window matches closingReminderMs: a quarter of the round, between 10 minutes and 2 hours.
  const closing = await pool.query(
    `SELECT m.id AS match_id, m.result->>'roundLabel' AS round_label, t.id AS tournament_id, t.name, tr.ends_at,
            p.id AS user_id, opp.username AS opponent
     FROM matches m
     JOIN tournaments t ON t.id = m.tournament_id AND t.play_format = 'draw' AND t.status = 'in_progress'
     JOIN tournament_rounds tr ON tr.tournament_id = m.tournament_id AND tr.round_number = m.round_number
     CROSS JOIN LATERAL (VALUES (m.player1_id, m.player2_id), (m.player2_id, m.player1_id)) AS pair(me, them)
     JOIN users p ON p.id = pair.me AND p.is_bot = FALSE
     JOIN users opp ON opp.id = pair.them
     WHERE m.phase = 'draw' AND m.status IN ('confirmed', 'in_progress')
       AND tr.status = 'active' AND tr.ends_at > NOW()
       AND tr.ends_at <= NOW() + (
         LEAST(7200000, GREATEST(600000, t.round_duration_minutes * 15000))::bigint * INTERVAL '1 millisecond'
       )
       AND NOT EXISTS (SELECT 1 FROM match_innings mi WHERE mi.match_id = m.id AND mi.user_id = p.id)
       AND NOT EXISTS (
         SELECT 1 FROM notifications n
         WHERE n.user_id = p.id AND n.idempotency_key = 'round-closing:' || m.id || ':' || p.id || ':in_app'
       )`
  );
  for (const row of closing.rows) {
    await send(
      row.user_id,
      'round_closing_soon',
      {
        ...roundClosingSoonNotice({ tournamentName: row.name, roundLabel: row.round_label ?? 'match', opponent: row.opponent, closesAt: row.ends_at }),
        emailData: { tournamentName: row.name, roundLabel: row.round_label ?? 'match', opponent: row.opponent, closesAt: row.ends_at },
        matchId: row.match_id,
        tournamentId: row.tournament_id,
        link: tournamentLink(row.tournament_id),
      },
      `round-closing:${row.match_id}:${row.user_id}`,
      true
    );
  }
}
