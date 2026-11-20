// Branded HTML + plain-text emails in the app's dark style; one layout for every message.
import { timeLeft } from '../draw-notifications.js';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const C = {
  bg: '#0a0a0a',
  card: '#141414',
  inset: '#1c1c1c',
  border: '#2a2a2a',
  text: '#ffffff',
  body: '#d4d4d4',
  muted: '#a3a3a3',
  faint: '#737373',
  brand: '#e31837',
  amber: '#f59e0b',
  gold: '#facc15',
};
const FONT = "Arial,'Helvetica Neue',Helvetica,sans-serif";

const esc = (t: string) =>
  t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface EmailLayout {
  preheader: string;
  eyebrow?: string;
  title: string;
  greeting?: string;
  paragraphs: string[];
  matchup?: { left: string; right: string };
  highlight?: { value: string; caption: string; color?: string };
  details?: Array<[string, string]>;
  cta?: { label: string; url: string };
  note?: string;
}

/** The shared frame: header, card with a red top bar, one button, footer. */
export function renderEmailLayout(l: EmailLayout, appUrl: string): { html: string; text: string } {
  const p = (t: string) =>
    `<p style="margin:0 0 14px;font:400 15px/1.6 ${FONT};color:${C.body}">${esc(t)}</p>`;
  const matchup = l.matchup
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;background:${C.inset};border:1px solid ${C.border};border-radius:12px">
        <tr>
          <td width="42%" align="center" style="padding:18px 8px;font:700 17px/1.3 ${FONT};color:${C.text}">${esc(l.matchup.left)}</td>
          <td width="16%" align="center" style="padding:18px 0;font:900 15px/1 ${FONT};color:${C.brand};letter-spacing:2px">VS</td>
          <td width="42%" align="center" style="padding:18px 8px;font:700 17px/1.3 ${FONT};color:${C.text}">${esc(l.matchup.right)}</td>
        </tr></table>`
    : '';
  const highlight = l.highlight
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;background:${C.inset};border:1px solid ${C.border};border-radius:12px">
        <tr><td align="center" style="padding:20px 12px 6px;font:900 44px/1 ${FONT};color:${l.highlight.color ?? C.brand}">${esc(l.highlight.value)}</td></tr>
        <tr><td align="center" style="padding:0 12px 18px;font:600 13px/1.4 ${FONT};color:${C.muted};text-transform:uppercase;letter-spacing:1px">${esc(l.highlight.caption)}</td></tr>
      </table>`
    : '';
  const details = l.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;border-top:1px solid ${C.border}">
        ${l.details
          .map(
            ([k, v]) => `<tr>
          <td style="padding:10px 0;border-bottom:1px solid ${C.border};font:400 14px ${FONT};color:${C.muted}">${esc(k)}</td>
          <td align="right" style="padding:10px 0;border-bottom:1px solid ${C.border};font:700 14px ${FONT};color:${C.text}">${esc(v)}</td>
        </tr>`
          )
          .join('')}
      </table>`
    : '';
  const cta = l.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 6px"><tr>
        <td bgcolor="${C.brand}" style="border-radius:10px;background:${C.brand}">
          <a href="${esc(l.cta.url)}" style="display:inline-block;padding:14px 28px;font:700 15px ${FONT};color:#ffffff;text-decoration:none;border-radius:10px">${esc(l.cta.label)}</a>
        </td></tr></table>`
    : '';

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<title>${esc(l.title)}</title></head>
<body style="margin:0;padding:0;background:${C.bg}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(l.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.bg}" style="background:${C.bg}">
<tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
  <tr><td style="padding:0 4px 18px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td width="38" height="38" align="center" bgcolor="${C.brand}" style="background:${C.brand};border-radius:9px;font:20px/38px ${FONT}">🏏</td>
      <td style="padding-left:12px;font:900 15px/1.2 ${FONT};color:${C.text};letter-spacing:2px">VR CRICKET LEAGUE<br>
        <span style="font:400 11px/1.6 ${FONT};color:${C.muted};letter-spacing:1px">by Pixel Paddle</span></td>
    </tr></table>
  </td></tr>
  <tr><td bgcolor="${C.card}" style="background:${C.card};border:1px solid ${C.border};border-top:4px solid ${C.brand};border-radius:16px;padding:30px 28px 26px">
    ${l.eyebrow ? `<p style="margin:0 0 8px;font:700 12px ${FONT};color:${C.brand};text-transform:uppercase;letter-spacing:2px">${esc(l.eyebrow)}</p>` : ''}
    <h1 style="margin:0 0 16px;font:800 26px/1.25 ${FONT};color:${C.text}">${esc(l.title)}</h1>
    ${l.greeting ? p(l.greeting) : ''}
    ${l.paragraphs.map(p).join('')}
    ${matchup}${highlight}${details}${cta}
    ${l.note ? `<p style="margin:16px 0 0;font:400 13px/1.5 ${FONT};color:${C.faint}">${esc(l.note)}</p>` : ''}
  </td></tr>
  <tr><td align="center" style="padding:22px 12px 4px;font:400 12px/1.6 ${FONT};color:${C.faint}">
    You're receiving this because you have a VR Cricket League account.<br>
    <a href="${esc(appUrl)}/profile" style="color:${C.muted}">Manage notifications</a> &nbsp;·&nbsp;
    <a href="${esc(appUrl)}" style="color:${C.muted}">${esc(appUrl.replace(/^https?:\/\//, ''))}</a><br>
    © ${new Date().getFullYear()} Pixel Paddle
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = [
    'VR CRICKET LEAGUE by Pixel Paddle',
    '',
    l.eyebrow ? l.eyebrow.toUpperCase() : '',
    l.title,
    '',
    l.greeting ?? '',
    ...l.paragraphs,
    l.matchup ? `${l.matchup.left}  vs  ${l.matchup.right}` : '',
    l.highlight ? `${l.highlight.value} — ${l.highlight.caption}` : '',
    ...(l.details ?? []).map(([k, v]) => `${k}: ${v}`),
    l.cta ? `\n${l.cta.label}: ${l.cta.url}` : '',
    l.note ?? '',
    '',
    '—',
    "You're receiving this because you have a VR Cricket League account.",
    `Manage notifications: ${appUrl}/profile`,
  ]
    .filter((line, i, all) => line !== '' || all[i - 1] !== '')
    .join('\n');

  return { html, text };
}

const build = (subject: string, layout: EmailLayout, appUrl: string): RenderedEmail => ({
  subject,
  ...renderEmailLayout(layout, appUrl),
});
const mine = (appUrl: string) => `${appUrl}/my-tournaments`;
const hi = (username?: string | null) => (username ? `Hi ${username},` : undefined);

export function welcomeEmail(d: { username: string }, appUrl: string): RenderedEmail {
  return build(`Welcome to VR Cricket League, ${d.username}!`, {
    preheader: 'Three steps and you are playing: choose a tournament, choose where, play.',
    eyebrow: 'Welcome',
    title: `You're in, ${d.username}!`,
    paragraphs: ['Super Over cricket in VR — at an arena near you or from home on your own Meta Quest. Here is how it works:'],
    details: [
      ['1', 'Choose a tournament'],
      ['2', 'Choose where you play'],
      ['3', 'Play each round, any time before it closes'],
    ],
    cta: { label: 'Choose a tournament', url: `${appUrl}/start` },
    note: 'Win your match to go through. Last player standing is the champion.',
  }, appUrl);
}

export function passwordResetEmail(d: { link: string }, appUrl: string): RenderedEmail {
  return build('Reset your VR Cricket League password', {
    preheader: 'Use this link within 1 hour to choose a new password.',
    eyebrow: 'Account security',
    title: 'Reset your password',
    paragraphs: ['Someone asked to reset the password for your account. The button below works once and expires in 1 hour.'],
    cta: { label: 'Choose a new password', url: d.link },
    note: "Didn't ask for this? Ignore this email — your password stays the same.",
  }, appUrl);
}

export function registeredEmail(
  d: { username?: string | null; tournamentName: string; startDate: string; playingAt?: string | null },
  appUrl: string
): RenderedEmail {
  return build(`You're in: ${d.tournamentName}`, {
    preheader: `${d.tournamentName} starts in ${timeLeft(d.startDate)}. Your first opponent is drawn at the start.`,
    eyebrow: d.tournamentName,
    title: "You're in!",
    greeting: hi(d.username),
    paragraphs: ['Your place is saved. Round 1 is drawn automatically when the tournament starts and we will tell you who you play.'],
    details: [
      ['Starts in', timeLeft(d.startDate)],
      ...(d.playingAt ? ([['Playing at', d.playingAt]] as Array<[string, string]>) : []),
    ],
    cta: { label: 'See my tournaments', url: mine(appUrl) },
    note: 'You can change where you play, or leave, until the tournament starts.',
  }, appUrl);
}

export function startingSoonEmail(d: { tournamentName: string; startsAt: string | Date }, appUrl: string): RenderedEmail {
  return build(`${d.tournamentName} starts in ${timeLeft(d.startsAt)}`, {
    preheader: 'Your first opponent is drawn the moment it begins.',
    eyebrow: d.tournamentName,
    title: 'Starting soon',
    paragraphs: ['Get ready — your first opponent is drawn the moment the tournament begins.'],
    highlight: { value: timeLeft(d.startsAt).replace(/^about /, ''), caption: 'until the start', color: C.amber },
    cta: { label: 'See my tournaments', url: mine(appUrl) },
  }, appUrl);
}

export function roundStartedEmail(
  d: { tournamentName: string; roundLabel: string; opponent: string; closesAt: string | Date; playingAt?: string | null },
  appUrl: string
): RenderedEmail {
  return build(`${d.roundLabel}: you vs ${d.opponent}`, {
    preheader: `Play any time in the next ${timeLeft(d.closesAt)}.`,
    eyebrow: `${d.tournamentName} · ${d.roundLabel}`,
    title: 'Your match is ready',
    paragraphs: [`Play your innings any time in the next ${timeLeft(d.closesAt)}. Whoever bats first sets the target.`],
    matchup: { left: 'You', right: d.opponent },
    details: [
      ['Play before', `in ${timeLeft(d.closesAt)}`],
      ['Where', d.playingAt ?? 'Home or your venue'],
    ],
    cta: { label: 'Play now', url: mine(appUrl) },
  }, appUrl);
}

export function opponentPlayedEmail(
  d: { tournamentName: string; roundLabel: string; opponent: string; opponentScore: number },
  appUrl: string
): RenderedEmail {
  return build(`Your turn — score ${d.opponentScore + 1} to win`, {
    preheader: `${d.opponent} scored ${d.opponentScore}. You need ${d.opponentScore + 1}.`,
    eyebrow: `${d.tournamentName} · ${d.roundLabel}`,
    title: 'Your turn to chase',
    paragraphs: [`${d.opponent} has played and scored ${d.opponentScore}.`],
    highlight: { value: String(d.opponentScore + 1), caption: 'runs to win' },
    cta: { label: 'Play now', url: mine(appUrl) },
  }, appUrl);
}

export function closingSoonEmail(
  d: { tournamentName: string; roundLabel: string; opponent: string; closesAt: string | Date },
  appUrl: string
): RenderedEmail {
  const left = timeLeft(d.closesAt);
  return build(`${left} left to play your ${d.roundLabel}`, {
    preheader: `Play ${d.opponent} before the round closes or you're out.`,
    eyebrow: `${d.tournamentName} · ${d.roundLabel}`,
    title: 'Time is running out',
    paragraphs: [`You haven't played your match against ${d.opponent} yet. Miss it and you're out.`],
    highlight: { value: left.replace(/^about /, ''), caption: 'left to play', color: C.amber },
    cta: { label: 'Play now', url: mine(appUrl) },
  }, appUrl);
}

export function knockedOutEmail(
  d: {
    tournamentName: string;
    roundLabel: string;
    opponent: string;
    myScore: number | null;
    opponentScore: number | null;
    walkover?: boolean;
    buyback?: { priceCents: number; until: string | Date } | null;
  },
  appUrl: string
): RenderedEmail {
  const price = d.buyback ? `$${(d.buyback.priceCents / 100).toFixed(d.buyback.priceCents % 100 ? 2 : 0)}` : '';
  return build(`You're out of ${d.tournamentName}`, {
    preheader: d.buyback ? `Buy back in for ${price} before round 1 closes.` : 'Thanks for playing — see you in the next one.',
    eyebrow: `${d.tournamentName} · ${d.roundLabel}`,
    title: d.buyback ? 'Out — but not finished' : 'Knocked out',
    paragraphs: [
      d.walkover
        ? `You didn't play your ${d.roundLabel} in time.`
        : `${d.opponent} beat you ${d.opponentScore ?? '–'}–${d.myScore ?? '–'}.`,
      d.buyback ? `You can buy your way back in and join the round 2 draw.` : 'Thanks for playing — join another tournament any time.',
    ],
    ...(d.buyback
      ? {
          highlight: { value: price, caption: `buyback · closes in ${timeLeft(d.buyback.until)}` },
          cta: { label: `Buy back in for ${price}`, url: mine(appUrl) },
        }
      : { cta: { label: 'Find another tournament', url: `${appUrl}/join` } }),
  }, appUrl);
}

export function buybackEmail(d: { tournamentName: string }, appUrl: string): RenderedEmail {
  return build(`You're back in ${d.tournamentName}!`, {
    preheader: "Buyback confirmed — you're in the next round's draw.",
    eyebrow: d.tournamentName,
    title: "You're back in!",
    paragraphs: ["Your buyback is confirmed. You'll be drawn against a new opponent in the next round."],
    cta: { label: 'See my tournaments', url: mine(appUrl) },
  }, appUrl);
}

export function championEmail(d: { tournamentName: string }, appUrl: string): RenderedEmail {
  return build(`🏆 You won ${d.tournamentName}!`, {
    preheader: 'Congratulations, champion.',
    eyebrow: d.tournamentName,
    title: 'Champion!',
    paragraphs: [`You won ${d.tournamentName}. Every round, every chase — you were the last player standing.`],
    highlight: { value: '🏆', caption: 'tournament champion', color: C.gold },
    cta: { label: 'See your win', url: mine(appUrl) },
  }, appUrl);
}

export function noticeEmail(d: { title: string; message: string; link?: string | null }, appUrl: string): RenderedEmail {
  return build(d.title, {
    preheader: d.message,
    title: d.title,
    paragraphs: [d.message],
    cta: { label: 'Open VR Cricket League', url: d.link ? `${appUrl}${d.link.startsWith('/') ? d.link : `/${d.link}`}` : mine(appUrl) },
  }, appUrl);
}

type Payload = Record<string, unknown> & { emailData?: Record<string, unknown> };

/** Pick the branded email for a notification; null when there is nothing to say. */
export function renderNotificationEmail(type: string, payload: Payload, appUrl: string): RenderedEmail | null {
  const d = (payload.emailData ?? {}) as Record<string, any>;
  const has = (...keys: string[]) => keys.every((k) => d[k] != null);
  switch (type) {
    case 'welcome':
      return welcomeEmail({ username: String(d.username ?? 'player') }, appUrl);
    case 'tournament_registered':
      if (payload.tournamentName && payload.startDate) {
        return registeredEmail({
          tournamentName: String(payload.tournamentName),
          startDate: String(payload.startDate),
          playingAt: (d.playingAt as string | undefined) ?? null,
        }, appUrl);
      }
      break;
    case 'tournament_starting_soon':
      if (has('tournamentName', 'startsAt')) return startingSoonEmail(d as never, appUrl);
      break;
    case 'round_started':
      if (has('tournamentName', 'roundLabel', 'opponent', 'closesAt')) return roundStartedEmail(d as never, appUrl);
      break;
    case 'opponent_played':
      if (has('tournamentName', 'roundLabel', 'opponent', 'opponentScore')) return opponentPlayedEmail(d as never, appUrl);
      break;
    case 'round_closing_soon':
      if (has('tournamentName', 'roundLabel', 'opponent', 'closesAt')) return closingSoonEmail(d as never, appUrl);
      break;
    case 'match_lost':
      if (has('tournamentName', 'roundLabel', 'opponent')) return knockedOutEmail(d as never, appUrl);
      break;
    case 'buyback_completed':
      if (has('tournamentName')) return buybackEmail(d as never, appUrl);
      break;
    case 'tournament_finished':
      if (has('tournamentName') && d.champion) return championEmail(d as never, appUrl);
      break;
  }
  if (typeof payload.message === 'string' && payload.message.trim()) {
    const title = typeof payload.title === 'string' ? payload.title : 'VR Cricket League update';
    return noticeEmail({ title, message: payload.message, link: (payload.link as string | undefined) ?? null }, appUrl);
  }
  return null;
}
