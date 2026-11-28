import { useId } from 'react';
import {
  CalendarCheck, Crown, Flame, Lock, Medal, Mountain, Rocket, ShieldCheck, Star, Swords, Target, Trophy, Zap,
} from 'lucide-react';
import { ACHIEVEMENTS, type AchievementIcon, type AchievementTier } from '@vr-tournament/shared';
import { cn } from '@/lib/utils';

/** Metal finish per tier: rim gradient stops and the glow colour. */
export const TIER_STYLE: Record<AchievementTier, { stops: [string, string, string]; glow: string; label: string; stars: number }> = {
  bronze: { stops: ['#f6d2a8', '#c07a3e', '#7a4320'], glow: 'rgba(192,122,62,0.45)', label: 'Bronze', stars: 1 },
  silver: { stops: ['#ffffff', '#b9c3cf', '#66717f'], glow: 'rgba(185,195,207,0.45)', label: 'Silver', stars: 2 },
  gold: { stops: ['#fff6c2', '#f4c430', '#a86b12'], glow: 'rgba(244,196,48,0.5)', label: 'Gold', stars: 3 },
  platinum: { stops: ['#e8fbff', '#7dd3fc', '#4f46e5'], glow: 'rgba(125,211,252,0.5)', label: 'Platinum', stars: 4 },
  legend: { stops: ['#fde68a', '#f472b6', '#7c3aed'], glow: 'rgba(244,114,182,0.55)', label: 'Legend', stars: 5 },
};

/** Cricket bat glyph; lucide has none. */
function BatIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M14.5 3.5l6 6-9.5 9.5a2.1 2.1 0 0 1-3 0l-3-3a2.1 2.1 0 0 1 0-3z" />
      <path d="M6 18l-3 3" />
      <circle cx="19" cy="19" r="2" />
    </svg>
  );
}

/** "6" or "4" ball glyph for boundary badges. */
function BallNumber({ n, className }: { n: 6 | 4; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth={2} />
      <path d="M5 7.5c2.5 2 2.5 7 0 9M19 7.5c-2.5 2-2.5 7 0 9" fill="none" stroke="currentColor" strokeWidth={1.2} strokeDasharray="1.6 1.6" />
      <text x="12" y="16.2" textAnchor="middle" fontSize="11.5" fontWeight="900" fill="currentColor" fontFamily="inherit">{n}</text>
    </svg>
  );
}

export function AchievementGlyph({ icon, className }: { icon: AchievementIcon; className?: string }) {
  switch (icon) {
    case 'six': return <BallNumber n={6} className={className} />;
    case 'four': return <BallNumber n={4} className={className} />;
    case 'bat': return <BatIcon className={className} />;
    case 'trophy': return <Trophy className={className} aria-hidden />;
    case 'crown': return <Crown className={className} aria-hidden />;
    case 'flame': return <Flame className={className} aria-hidden />;
    case 'zap': return <Zap className={className} aria-hidden />;
    case 'target': return <Target className={className} aria-hidden />;
    case 'shield': return <ShieldCheck className={className} aria-hidden />;
    case 'calendar': return <CalendarCheck className={className} aria-hidden />;
    case 'swords': return <Swords className={className} aria-hidden />;
    case 'rocket': return <Rocket className={className} aria-hidden />;
    case 'mountain': return <Mountain className={className} aria-hidden />;
    case 'star': return <Star className={className} aria-hidden />;
    case 'medal': return <Medal className={className} aria-hidden />;
  }
}

/** A hexagonal medal: metallic rim by tier, dark enamel centre, icon, shine and tier stars. */
export function BadgeArt({
  icon,
  tier,
  earned = true,
  size = 88,
  className,
}: {
  icon: AchievementIcon;
  tier: AchievementTier;
  earned?: boolean;
  size?: number;
  className?: string;
}) {
  const id = useId().replace(/:/g, '');
  const t = TIER_STYLE[tier];
  const glyph = Math.round(size * 0.36);
  return (
    <div
      className={cn('relative shrink-0 transition-transform duration-300', earned && 'hover:-translate-y-0.5 hover:-rotate-2', className)}
      style={{ width: size, height: size * 1.12, filter: earned ? `drop-shadow(0 6px 14px ${t.glow})` : 'grayscale(1)', opacity: earned ? 1 : 0.42 }}
      aria-hidden
    >
      <svg viewBox="0 0 100 112" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id={`rim-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={t.stops[0]} />
            <stop offset="50%" stopColor={t.stops[1]} />
            <stop offset="100%" stopColor={t.stops[2]} />
          </linearGradient>
          <radialGradient id={`core-${id}`} cx="50%" cy="38%" r="65%">
            <stop offset="0%" stopColor="#2a3142" />
            <stop offset="100%" stopColor="#0b0f19" />
          </radialGradient>
          <linearGradient id={`shine-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="45%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M50 3 L91 26 L91 76 L50 99 L9 76 L9 26 Z" fill={`url(#rim-${id})`} stroke="rgba(0,0,0,0.35)" strokeWidth="1" strokeLinejoin="round" />
        <path d="M50 10 L85 30 L85 72 L50 92 L15 72 L15 30 Z" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M50 15 L80 32 L80 70 L50 87 L20 70 L20 32 Z" fill={`url(#core-${id})`} />
        <path d="M50 15 L80 32 L80 70 L50 87 L20 70 L20 32 Z" fill="none" stroke={t.stops[1]} strokeOpacity="0.55" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M50 3 L91 26 L91 44 C70 40 40 34 9 52 L9 26 Z" fill={`url(#shine-${id})`} />
        <rect x={50 - t.stars * 6 - 4} y="96" width={t.stars * 12 + 8} height="13" rx="6.5" fill={`url(#rim-${id})`} stroke="rgba(0,0,0,0.35)" strokeWidth="0.8" />
        {Array.from({ length: t.stars }, (_, i) => {
          const cx = 50 - (t.stars - 1) * 6 + i * 12;
          return (
            <path
              key={i}
              d={`M${cx} 98.3 l1.4 2.9 3.2 .4 -2.3 2.2 .6 3.1 -2.9 -1.5 -2.9 1.5 .6 -3.1 -2.3 -2.2 3.2 -.4z`}
              fill="#1a1205"
              fillOpacity="0.75"
            />
          );
        })}
      </svg>
      <div className="absolute inset-x-0 flex items-center justify-center text-white" style={{ top: size * 0.25, height: size * 0.52 }}>
        <span className="flex items-center justify-center [&>svg]:h-full [&>svg]:w-full" style={{ width: glyph, height: glyph, filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.35))' }}>
          <AchievementGlyph icon={icon} />
        </span>
      </div>
      {!earned && (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-card)]">
          <Lock className="h-3 w-3 text-[var(--color-muted-foreground)]" />
        </span>
      )}
    </div>
  );
}

/** Title nameplate shown beside a player's name, e.g. "Six Machine". */
export function TitlePlate({ name, tier, icon, size = 'md' }: { name: string; tier: AchievementTier; icon?: AchievementIcon; size?: 'sm' | 'md' }) {
  const t = TIER_STYLE[tier];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border font-bold uppercase tracking-wider text-[#140d02] shadow-sm',
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
      )}
      style={{ backgroundImage: `linear-gradient(135deg, ${t.stops[0]}, ${t.stops[1]} 55%, ${t.stops[2]})`, borderColor: 'rgba(0,0,0,0.25)' }}
    >
      {icon && <AchievementGlyph icon={icon} className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />}
      {name}
    </span>
  );
}

/** Title plate from just the shown title text (looks up its tier and icon). */
export function TitleByName({ name, size = 'sm' }: { name: string | null | undefined; size?: 'sm' | 'md' }) {
  if (!name) return null;
  const def = TITLE_BY_NAME.get(name);
  return <TitlePlate name={name} tier={def?.tier ?? 'bronze'} icon={def?.icon} size={size} />;
}

const TITLE_BY_NAME = new Map(ACHIEVEMENTS.filter((a) => a.kind === 'title').map((a) => [a.name, a]));
