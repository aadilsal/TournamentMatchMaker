import { motion } from 'motion/react';
import { MapPin, Calendar, Users, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';

const chapters = [
  {
    id: 'discover',
    step: '01',
    icon: MapPin,
    label: 'Discover',
    title: 'Find your ground',
    description:
      'PostGIS-powered geo search finds certified VR cricket venues within 50km. Filter by city, check live capacity, and pick your arena before slots fill up.',
    accent: 'from-red-600/50 via-red-900/30 to-transparent',
    glow: 'shadow-red-500/20',
    visual: 'venues' as const,
  },
  {
    id: 'book',
    step: '02',
    icon: Calendar,
    label: 'Book',
    title: 'Reserve your crease',
    description:
      'Pick a match session and lock it in instantly. PostgreSQL row locks and Redis slot guards guarantee your slot — zero conflicts, even at tournament launch.',
    accent: 'from-red-500/40 via-red-950/30 to-transparent',
    glow: 'shadow-red-500/20',
    visual: 'slots' as const,
  },
  {
    id: 'match',
    step: '03',
    icon: Users,
    label: 'Match',
    title: 'Enter the over',
    description:
      'Skill-tier matchmaking pairs you with the right opponent. Both on Meta Quest? Play remote. Need a venue? We auto-book the nearest VR cricket arena.',
    accent: 'from-white/10 via-red-900/30 to-transparent',
    glow: 'shadow-red-500/20',
    visual: 'queue' as const,
  },
  {
    id: 'win',
    step: '04',
    icon: Trophy,
    label: 'Win',
    title: 'Lift the cup',
    description:
      'Tournament brackets, Socket.IO live updates, and email alerts keep you in the fight. From match found to trophy lift — sub-second feedback, every step.',
    accent: 'from-red-700/35 via-black/25 to-transparent',
    glow: 'shadow-red-500/20',
    visual: 'bracket' as const,
  },
];

function ChapterVisual({ type, active }: { type: (typeof chapters)[0]['visual']; active: boolean }) {
  const base = cn(
    'transition-all duration-700',
    active ? 'opacity-100 scale-100' : 'opacity-40 scale-95'
  );

  if (type === 'venues') {
    return (
      <div className={cn('space-y-3', base)}>
        {['VR Cricket Arena — Toronto', 'The Pitch — Brampton', 'VR Sports Hub — Vancouver'].map((name, i) => (
          <div
            key={name}
            className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm"
            style={{ transitionDelay: `${i * 80}ms` }}
          >
            <div className="flex items-center gap-3">
              <MapPin className="h-4 w-4 text-[var(--color-primary)]" />
              <div>
                <p className="text-sm font-medium">{name}</p>
                <p className="text-xs text-[var(--color-muted-foreground)]">{(i + 1.2).toFixed(1)} km away</p>
              </div>
            </div>
            <span className="text-xs text-white font-medium">Open</span>
          </div>
        ))}
      </div>
    );
  }

  if (type === 'slots') {
    return (
      <div className={cn('grid grid-cols-2 gap-2', base)}>
        {['10:00', '11:00', '14:00', '15:00', '16:00', '17:00'].map((time, i) => (
          <div
            key={time}
            className={cn(
              'rounded-lg border px-3 py-2.5 text-center text-sm',
              i === 2
                ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/20 text-white font-medium'
                : 'border-white/10 bg-white/5 text-[var(--color-muted-foreground)]'
            )}
          >
            {time}
          </div>
        ))}
      </div>
    );
  }

  if (type === 'queue') {
    return (
      <div className={cn('space-y-4', base)}>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between text-xs text-[var(--color-muted-foreground)] mb-3">
            <span>Cricket matchmaking</span>
            <span className="text-[var(--color-primary)]">Tier 3 Batsman</span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-red-600 to-red-400"
              animate={{ width: active ? ['20%', '75%', '45%'] : '20%' }}
              transition={{ duration: 3, repeat: active ? Infinity : 0, ease: 'easeInOut' }}
            />
          </div>
          <p className="mt-3 text-sm">Searching for opponent… <span className="text-white font-medium">12s</span></p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 px-4 py-3">
          <Users className="h-5 w-5 text-[var(--color-primary)]" />
          <div>
            <p className="text-sm font-medium text-white">Match found!</p>
            <p className="text-xs text-[var(--color-muted-foreground)]">Ali_99 vs Hamza_VR — Tier 3</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', base)}>
      {[
        { round: 'Semi-final', players: 'You vs Hamza_VR' },
        { round: 'Final', players: 'You vs TheCaptain' },
      ].map((match, i) => (
        <div key={match.round} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <Trophy className={cn('h-4 w-4', i === 1 ? 'text-[var(--color-primary)]' : 'text-[var(--color-muted-foreground)]')} />
          <div>
            <p className="text-xs text-[var(--color-muted-foreground)]">{match.round}</p>
            <p className="text-sm font-medium">{match.players}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function StorySection() {
  return (
    <section id="story" className="py-32 scroll-mt-16 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
          className="mb-20"
        >
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-muted-foreground)]">Your season</p>
          <h2 className="mt-2 text-3xl sm:text-4xl font-bold">From first over to champion</h2>
        </motion.div>

        <div className="space-y-24 lg:space-y-32">
          {chapters.map((chapter, i) => {
            const Icon = chapter.icon;
            const isEven = i % 2 === 0;
            return (
              <div key={chapter.id} className="grid md:grid-cols-2 gap-10 lg:gap-16 items-center">
                <motion.div
                  initial={{ opacity: 0, x: isEven ? -32 : 32 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
                  className={cn(!isEven && 'md:order-2')}
                >
                  <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 px-3 py-1 text-xs font-mono text-[var(--color-accent-foreground)]">
                    <Icon className="h-3 w-3" />
                    Step {chapter.step}
                  </span>
                  <h3 className="mt-5 text-3xl sm:text-4xl font-bold tracking-tight leading-[1.1]">
                    {chapter.title}
                  </h3>
                  <p className="mt-5 text-base sm:text-lg text-[var(--color-muted-foreground)] leading-relaxed">
                    {chapter.description}
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, x: isEven ? 32 : -32 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{ duration: 0.65, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                  className={cn(
                    'relative rounded-2xl border border-white/10 p-6 sm:p-8 min-h-[260px] overflow-hidden',
                    'bg-gradient-to-br shadow-2xl',
                    chapter.accent,
                    chapter.glow,
                    !isEven && 'md:order-1'
                  )}
                >
                  <div className="absolute inset-0 landing-grid opacity-30" />
                  <div className="relative z-10">
                    <ChapterVisual type={chapter.visual} active />
                  </div>
                </motion.div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
