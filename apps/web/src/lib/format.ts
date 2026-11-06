type DateInput = string | number | Date;

const toDate = (value: DateInput) => (value instanceof Date ? value : new Date(value));
const pad = (n: number) => String(n).padStart(2, '0');

function parts(value: DateInput, options: Intl.DateTimeFormatOptions) {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('en-US', options).formatToParts(toDate(value))) {
    out[p.type] = p.value;
  }
  return out;
}

/** "Fri 6 Nov" (year appended when it is not the current year). */
export function formatDate(value: DateInput): string {
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return '—';
  const p = parts(d, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const year = d.getFullYear() === new Date().getFullYear() ? '' : ` ${p.year}`;
  return `${p.weekday} ${p.day} ${p.month}${year}`;
}

/** "7:00 PM" */
export function formatTime(value: DateInput): string {
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return '—';
  const p = parts(d, { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${p.hour}:${p.minute} ${p.dayPeriod}`;
}

/** "Fri 6 Nov, 7:00 PM" */
export function formatDateTime(value: DateInput): string {
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${formatDate(d)}, ${formatTime(d)}`;
}

/** "Fri 6 Nov, 7:00 PM – 8:00 PM", collapsing the date when both ends share a day. */
export function formatDateTimeRange(start: DateInput, end: DateInput): string {
  const s = toDate(start);
  const e = toDate(end);
  return toLocalDateKey(s) === toLocalDateKey(e)
    ? `${formatDateTime(s)} – ${formatTime(e)}`
    : `${formatDateTime(s)} – ${formatDateTime(e)}`;
}

/** Local calendar day as YYYY-MM-DD (never toISOString, which is UTC). */
export function toLocalDateKey(value: DateInput = new Date()): string {
  const d = toDate(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The browser's IANA zone, sent so the API buckets days the way the user sees them. */
export const localTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Parses YYYY-MM-DD as a local-midnight Date. */
export function fromLocalDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

/** ISO timestamp → value for <input type="datetime-local"> in the viewer's zone. */
export function toDateTimeLocal(value: DateInput | null | undefined): string {
  if (value == null || value === '') return '';
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${toLocalDateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** 500 → "$5.00" */
export function formatMoneyCents(cents: number | null | undefined): string {
  return cents == null ? '—' : usd.format(cents / 100);
}

/** "2.50" → 250; null unless a non-negative amount with at most two decimals. */
export function dollarsToCents(value: string): number | null {
  const v = value.trim();
  if (!/^(\d+(\.\d{0,2})?|\.\d{1,2})$/.test(v)) return null;
  return Math.round(Number(v) * 100);
}

/** 250 → "2.50", for seeding a dollars input. */
export function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** 4692 → "1 h 18 m"; seconds only under a minute. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s < 60) return `${s} s`;
  const days = Math.floor(s / 86_400);
  const hours = Math.floor((s % 86_400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days} d ${hours} h`;
  if (hours > 0) return `${hours} h ${mins} m`;
  return `${mins} m`;
}

/** "venue_admin" → "Venue admin" for enums without a dedicated label. */
export function humanizeEnum(value: string | null | undefined): string {
  if (!value) return '—';
  const s = value.replace(/_/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const ROLE_LABELS: Record<string, string> = {
  player: 'Player',
  superadmin: 'Superadmin',
  venue_admin: 'Venue admin',
  tournament_admin: 'Tournament admin',
};

export const roleLabel = (role: string | null | undefined) =>
  (role && ROLE_LABELS[role]) || humanizeEnum(role);

const PHASE_LABELS: Record<string, string> = {
  normal: 'Normal rounds',
  knockout: 'Knockout',
};

export const phaseLabel = (phase: string | null | undefined) =>
  (phase && PHASE_LABELS[phase]) || humanizeEnum(phase);
