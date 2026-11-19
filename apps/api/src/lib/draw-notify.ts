import type { Pool } from 'pg';
import {
  drawLostNotice,
  drawWonNotice,
  matchTiedNotice,
  opponentPlayedNotice,
  tournamentLink,
} from '@vr-tournament/shared';
import type { Env } from '../config/env.js';
import { enqueueNotification } from './bullmq.js';

/** Names, scores, round and buyback facts for one draw match. */
async function details(pool: Pool, matchId: string) {
  const r = await pool.query(
    `SELECT m.id, m.tournament_id, m.player1_id, m.player2_id, m.round_number, m.result,
            t.name AS tournament_name, t.buyback_price_cents, t.current_round_number, t.status AS tournament_status,
            tr.ends_at, u1.username AS p1_name, u2.username AS p2_name, u1.is_bot AS p1_bot, u2.is_bot AS p2_bot
     FROM matches m
     JOIN tournaments t ON t.id = m.tournament_id
     LEFT JOIN tournament_rounds tr ON tr.tournament_id = m.tournament_id AND tr.round_number = m.round_number
     JOIN users u1 ON u1.id = m.player1_id
     JOIN users u2 ON u2.id = m.player2_id
     WHERE m.id = $1 AND m.phase = 'draw'`,
    [matchId]
  );
  const row = r.rows[0];
  if (!row) return null;
  const result = (row.result ?? {}) as Record<string, unknown>;
  return {
    row,
    result,
    tournamentName: row.tournament_name as string,
    roundLabel: (result.roundLabel as string | undefined) ?? 'match',
    closesAt: row.ends_at as Date,
    link: tournamentLink(row.tournament_id),
    isBot: (id: string) => (id === row.player1_id ? row.p1_bot : row.p2_bot) === true,
    nameOf: (id: string) => (id === row.player1_id ? row.p1_name : row.p2_name) as string,
    scoreOf: (id: string) => ((id === row.player1_id ? result.player1Score : result.player2Score) as number | null) ?? null,
  };
}

type Notice = { title: string; message: string };

function send(env: Env, userId: string, type: string, notice: Notice, extra: Record<string, unknown>, key: string, email = false) {
  enqueueNotification(env, {
    userId,
    type,
    channels: email ? ['in_app', 'email'] : ['in_app'],
    payload: { ...notice, ...extra },
    idempotencyKey: key,
  }).catch((err: unknown) => console.error(`Failed to enqueue ${type}:`, err));
}

/** A decided draw match: "you're through" / "you're out" (with the buyback offer in round 1). */
export async function notifyDrawResult(pool: Pool, env: Env, matchId: string, winnerId: string, loserId: string) {
  const d = await details(pool, matchId);
  if (!d) return;
  const base = { matchId, tournamentId: d.row.tournament_id, link: d.link };
  const buybackOpen =
    d.row.tournament_status === 'in_progress' &&
    Number(d.row.round_number) === 1 &&
    Number(d.row.current_round_number) === 1 &&
    Number(d.row.buyback_price_cents) >= 50 &&
    d.roundLabel !== 'Final' &&
    d.closesAt != null &&
    new Date(d.closesAt).getTime() > Date.now();

  if (!d.isBot(winnerId)) {
    send(
      env,
      winnerId,
      'match_won',
      drawWonNotice({
        tournamentName: d.tournamentName,
        roundLabel: d.roundLabel,
        opponent: d.nameOf(loserId),
        myScore: d.scoreOf(winnerId),
        opponentScore: d.scoreOf(loserId),
        walkover: false,
        isFinal: d.roundLabel === 'Final',
        nextDrawAt: d.roundLabel === 'Final' ? null : d.closesAt,
      }),
      base,
      `match-won:${matchId}:${winnerId}`
    );
  }
  if (!d.isBot(loserId)) {
    send(
      env,
      loserId,
      'match_lost',
      drawLostNotice({
        tournamentName: d.tournamentName,
        roundLabel: d.roundLabel,
        opponent: d.nameOf(winnerId),
        myScore: d.scoreOf(loserId),
        opponentScore: d.scoreOf(winnerId),
        walkover: false,
        buyback: buybackOpen ? { priceCents: Number(d.row.buyback_price_cents), until: d.closesAt } : null,
      }),
      base,
      `match-lost:${matchId}:${loserId}`,
      buybackOpen
    );
  }
}

/** A tie: both players are told to replay before the round closes. */
export async function notifyDrawTie(pool: Pool, env: Env, matchId: string, score: number, attempt: number) {
  const d = await details(pool, matchId);
  if (!d) return;
  for (const [me, them] of [[d.row.player1_id, d.row.player2_id], [d.row.player2_id, d.row.player1_id]] as const) {
    if (d.isBot(me)) continue;
    send(
      env,
      me,
      'match_tied',
      matchTiedNotice({ tournamentName: d.tournamentName, roundLabel: d.roundLabel, opponent: d.nameOf(them), score, closesAt: d.closesAt }),
      { matchId, tournamentId: d.row.tournament_id, link: d.link },
      `match-tied:${matchId}:${attempt}:${me}`
    );
  }
}

/** First innings in: tell the other player it's their turn and what to beat. Bots are not told. */
export async function notifyOpponentPlayed(pool: Pool, env: Env, matchId: string, batterId: string, score: number) {
  const d = await details(pool, matchId);
  if (!d) return;
  const otherId = batterId === d.row.player1_id ? d.row.player2_id : d.row.player1_id;
  if (d.isBot(otherId)) return;
  send(
    env,
    otherId,
    'opponent_played',
    opponentPlayedNotice({ tournamentName: d.tournamentName, roundLabel: d.roundLabel, opponent: d.nameOf(batterId), opponentScore: score }),
    { matchId, tournamentId: d.row.tournament_id, link: d.link },
    `opponent-played:${matchId}:${Number(d.result.tieCount ?? 0)}:${otherId}`,
    true
  );
}
