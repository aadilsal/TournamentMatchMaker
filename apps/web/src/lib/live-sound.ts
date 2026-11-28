// Small generated sound effects for the live score; off unless the viewer turns them on.
const KEY = 'live-sound-on';

export function isLiveSoundOn(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setLiveSoundOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* private mode: the choice lasts for this page only */
  }
}

let ctx: AudioContext | null = null;

function tone(freq: number, start: number, length: number, type: OscillatorType, gain = 0.15) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
  g.gain.setValueAtTime(gain, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + length);
  osc.connect(g).connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + length);
}

/** Plays a short cue for a ball: rising chimes for 4 and 6, a low thud for a wicket. */
export function playLiveSound(kind: 'four' | 'six' | 'wicket' | 'runs') {
  if (!isLiveSoundOn()) return;
  try {
    ctx ??= new AudioContext();
    if (kind === 'four') [523, 659, 784].forEach((f, i) => tone(f, i * 0.08, 0.25, 'triangle'));
    else if (kind === 'six') [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.07, 0.35, 'square', 0.09));
    else if (kind === 'wicket') tone(110, 0, 0.45, 'sawtooth', 0.12);
    else tone(440, 0, 0.12, 'sine', 0.08);
  } catch {
    /* audio blocked by the browser */
  }
}
