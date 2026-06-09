import { useRef, useState, useEffect } from 'react';
import {
  motion,
  useScroll,
  useTransform,
  useMotionValueEvent,
  useInView,
  useMotionValue,
  AnimatePresence,
} from 'motion/react';
import { MapPin, Calendar, Users, Trophy, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const chapters = [
  {
    id: 'discover',
    step: '01',
    icon: MapPin,
    label: 'Discover',
    title: 'Find your arena',
    description:
      'PostGIS-powered geo search surfaces VR venues within 50km. Filter by city, sort by distance, and see live capacity before you commit.',
    accent: 'from-violet-600/50 via-purple-800/30 to-transparent',
    glow: 'shadow-violet-500/20',
    visual: 'venues' as const,
  },
  {
    id: 'book',
    step: '02',
    icon: Calendar,
    label: 'Book',
    title: 'Reserve your slot',
    description:
      'Pick an hourly window and lock it in. PostgreSQL row locks and Redis slot guards guarantee zero double-bookings — even under peak load.',
    accent: 'from-fuchsia-600/40 via-violet-900/30 to-transparent',
    glow: 'shadow-fuchsia-500/20',
    visual: 'slots' as const,
  },
  {
    id: 'match',
    step: '03',
    icon: Users,
    label: 'Match',
    title: 'Enter the queue',
    description:
      'Random matchmaking pairs you with the next available opponent. Both on Meta Quest? Play remote. Need a venue? We auto-book the nearest shared arena.',
    accent: 'from-indigo-600/40 via-blue-900/30 to-transparent',
    glow: 'shadow-indigo-500/20',
    visual: 'queue' as const,
  },
  {
    id: 'win',
    step: '04',
    icon: Trophy,
    label: 'Win',
    title: 'Claim the bracket',
    description:
      'Tournament brackets, Socket.IO live updates, and email alerts keep you in the fight. From queue pop to trophy lift — sub-second feedback.',
    accent: 'from-amber-500/35 via-orange-900/25 to-transparent',
    glow: 'shadow-amber-500/20',
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
        {['VR Arena Lahore', 'GameZone Hub', 'Tekken VR Lounge'].map((name, i) => (
          <div
            key={name}
            className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm"
            style={{ transitionDelay: `${i * 80}ms` }}
          >
            <div className="flex items-center gap-3">
              <MapPin className="h-4 w-4 text-violet-400" />
              <div>
                <p className="text-sm font-medium">{name}</p>
                <p className="text-xs text-[var(--color-muted-foreground)]">{(i + 1.2).toFixed(1)} km away</p>
              </div>
            </div>
            <span className="text-xs text-emerald-400 font-medium">Open</span>
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
            <span>Matchmaking queue</span>
            <span className="text-[var(--color-primary)]">Tier 3</span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
              animate={{ width: active ? ['20%', '75%', '45%'] : '20%' }}
              transition={{ duration: 3, repeat: active ? Infinity : 0, ease: 'easeInOut' }}
            />
          </div>
          <p className="mt-3 text-sm">Searching for opponent… <span className="text-white font-medium">12s</span></p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
          <Users className="h-5 w-5 text-emerald-400" />
          <div>
            <p className="text-sm font-medium text-emerald-300">Match found!</p>
            <p className="text-xs text-[var(--color-muted-foreground)]">player1 vs rival_x — Tier 3</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', base)}>
      {[
        { round: 'Semi-final', players: 'You vs Rival_X' },
        { round: 'Final', players: 'You vs Champion' },
      ].map((match, i) => (
        <div key={match.round} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <Trophy className={cn('h-4 w-4', i === 1 ? 'text-amber-400' : 'text-[var(--color-muted-foreground)]')} />
          <div>
            <p className="text-xs text-[var(--color-muted-foreground)]">{match.round}</p>
            <p className="text-sm font-medium">{match.players}</p>
          </div>
          {i === 0 && <ChevronRight className="h-4 w-4 ml-auto text-[var(--color-primary)]" />}
        </div>
      ))}
    </div>
  );
}

function ChapterRail({ active }: { active: number }) {
  return (
    <div className="hidden lg:flex flex-col gap-3">
      {chapters.map((chapter, i) => {
        const Icon = chapter.icon;
        const isActive = i === active;
        return (
          <div
            key={chapter.id}
            className={cn(
              'flex items-center gap-3 rounded-xl px-4 py-3 border transition-all duration-500',
              isActive
                ? 'border-[var(--color-primary)]/50 bg-[var(--color-primary)]/10'
                : 'border-transparent bg-transparent opacity-50'
            )}
          >
            <div
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
                isActive ? 'bg-[var(--color-primary)] text-white' : 'bg-white/10 text-[var(--color-muted-foreground)]'
              )}
            >
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-mono text-[var(--color-muted-foreground)]">{chapter.step}</p>
              <p className={cn('text-sm font-medium', isActive && 'text-white')}>{chapter.label}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StoryContent({ active }: { active: number }) {
  const chapter = chapters[active];
  const Icon = chapter.icon;

  return (
    <motion.div
      key={chapter.id}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="grid lg:grid-cols-[200px_1fr_1fr] gap-8 lg:gap-12 items-center w-full"
    >
      <ChapterRail active={active} />

      <div className="lg:col-span-1">
        <div className="lg:hidden flex items-center gap-2 mb-6">
          {chapters.map((c, i) => (
            <div
              key={c.id}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors duration-500',
                i === active ? 'bg-[var(--color-primary)]' : 'bg-white/10'
              )}
            />
          ))}
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 px-3 py-1 text-xs font-mono text-[var(--color-accent-foreground)]">
          <Icon className="h-3 w-3" />
          Step {chapter.step}
        </span>
        <h3 className="mt-5 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-[1.1]">
          {chapter.title}
        </h3>
        <p className="mt-5 text-base sm:text-lg text-[var(--color-muted-foreground)] leading-relaxed max-w-lg">
          {chapter.description}
        </p>
      </div>

      <div
        className={cn(
          'relative rounded-2xl border border-white/10 p-6 sm:p-8 min-h-[280px] sm:min-h-[320px] overflow-hidden',
          'bg-gradient-to-br',
          chapter.accent,
          'shadow-2xl',
          chapter.glow
        )}
      >
        <div className="absolute inset-0 landing-grid opacity-30" />
        <div className="relative z-10">
          <ChapterVisual type={chapter.visual} active />
        </div>
      </div>
    </motion.div>
  );
}

function StaticStory() {
  return (
    <section id="story" className="py-24 px-6 max-w-7xl mx-auto space-y-16">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-muted-foreground)]">Your journey</p>
        <h2 className="mt-2 text-3xl font-bold">From queue to champion</h2>
      </div>
      {chapters.map((chapter, i) => (
        <div key={chapter.id} className="grid md:grid-cols-2 gap-8 items-center">
          <div>
            <span className="text-sm font-mono text-[var(--color-primary)]">{chapter.step}</span>
            <h3 className="mt-3 text-2xl font-bold">{chapter.title}</h3>
            <p className="mt-4 text-[var(--color-muted-foreground)]">{chapter.description}</p>
          </div>
          <div className={cn('rounded-2xl border border-white/10 p-6 bg-gradient-to-br', chapter.accent)}>
            <ChapterVisual type={chapter.visual} active={i === 0} />
          </div>
        </div>
      ))}
    </section>
  );
}

/** Scroll track height: ~55vh per chapter — enough for scrollytelling without a huge void */
const STORY_SCROLL_VH = chapters.length * 55;

export function StorySection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  useMotionValueEvent(scrollYProgress, 'change', (progress) => {
    const idx = Math.min(
      chapters.length - 1,
      Math.max(0, Math.floor(progress * chapters.length))
    );
    setActive(idx);
  });

  const progressWidth = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);

  /** Only pin while the scroll track intersects the viewport (avoids covering hero/stats) */
  const storyInView = useInView(containerRef, { amount: 0 });
  const inViewFactor = useMotionValue(0);

  useEffect(() => {
    inViewFactor.set(storyInView ? 1 : 0);
  }, [storyInView, inViewFactor]);

  const endFade = useTransform(scrollYProgress, [0.92, 1], [1, 0]);

  /** Fixed overlay (not sticky) — Lenis breaks position:sticky */
  const overlayOpacity = useTransform([inViewFactor, endFade], ([inv, fade]) => {
    const a = typeof inv === 'number' ? inv : 0;
    const b = typeof fade === 'number' ? fade : 0;
    return a * b;
  });

  const overlayPointerEvents = useTransform(overlayOpacity, (o) => (o > 0.05 ? 'auto' : 'none'));

  if (reducedMotion) {
    return <StaticStory />;
  }

  return (
    <>
      {/* Invisible scroll track — drives progress without sticky */}
      <section
        id="story"
        ref={containerRef}
        className="relative scroll-mt-16"
        style={{ height: `${STORY_SCROLL_VH}vh` }}
      />

      {/* Fixed story panel visible only while section is in view */}
      <motion.div
        role="region"
        aria-label="Your journey from queue to champion"
        style={{ opacity: overlayOpacity, pointerEvents: overlayPointerEvents }}
        className="fixed inset-x-0 top-16 bottom-0 z-20 flex flex-col justify-center overflow-hidden"
      >
        <div className="absolute inset-0 bg-[var(--color-background)]" />
        <div className="absolute inset-0 landing-grid opacity-20" />
        <div className="landing-orb landing-orb-1 opacity-40" aria-hidden />

        <div className="absolute inset-x-0 top-0 h-1 bg-white/5 z-10">
          <motion.div className="h-full bg-[var(--color-primary)]" style={{ width: progressWidth }} />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-6 w-full py-12">
          <div className="mb-8 lg:mb-10">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-muted-foreground)]">Your journey</p>
            <h2 className="mt-2 text-2xl sm:text-3xl font-bold">From queue to champion</h2>
            <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
              Scroll to walk through each step — {active + 1} of {chapters.length}
            </p>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <StoryContent active={active} />
          </AnimatePresence>
        </div>
      </motion.div>
    </>
  );
}
