import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowRight, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function HeroSection() {
  return (
    <section className="relative min-h-[100svh] flex items-center overflow-hidden pt-16">
      {/* Background orbs + grid only — pitch SVG removed */}
      <div className="landing-orb landing-orb-1" aria-hidden />
      <div className="landing-orb landing-orb-2" aria-hidden />
      <div className="landing-grid" aria-hidden />

      {/* ── Neon batsman — absolute, full right-side, no container box ── */}
      <div className="absolute right-0 top-0 bottom-0 w-[58%] pointer-events-none hidden lg:block" aria-hidden>
        {/* Ambient red glow behind the figure — matches site primary */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 70% 60% at 65% 50%, rgba(227,24,55,0.28) 0%, rgba(139,0,20,0.12) 55%, transparent 100%)',
          }}
        />

        <img
          src="/images/cricket-image-4.png"
          alt="VR cricket batsman"
          className="absolute inset-0 w-full h-full object-contain object-center"
          style={{
            maskImage:
              'linear-gradient(to right, transparent 0%, black 18%, black 88%, transparent 100%), linear-gradient(to bottom, transparent 0%, black 8%, black 92%, transparent 100%)',
            maskComposite: 'intersect',
            WebkitMaskImage:
              'linear-gradient(to right, transparent 0%, black 18%, black 88%, transparent 100%)',
            filter:
              'saturate(1.1) drop-shadow(0 0 55px rgba(227,24,55,0.55)) drop-shadow(0 0 140px rgba(227,24,55,0.25))',
          }}
        />
      </div>

      {/* ── Text content — left half ── */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 py-24 w-full">
        <div className="max-w-[520px]">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 px-4 py-1.5 text-xs font-medium text-[var(--color-accent-foreground)] mb-8">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)] animate-pulse" />
              Season 1 Open — Canada's first VR cricket tournament
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.05]"
          >
            Cricket in VR.
            <br />
            <span className="landing-gradient-text">Step to the Crease.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.25 }}
            className="mt-6 text-lg text-[var(--color-muted-foreground)] leading-relaxed"
          >
            Canada's first VR cricket tournament. Register, book your arena
            slot, and compete in Super Over format — with a Meta Quest at home
            or at a VR venue near you.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-10 flex flex-col sm:flex-row items-start gap-4"
          >
            <Link to="/register">
              <Button size="lg" className="h-12 px-8 text-base gap-2 shadow-xl shadow-[var(--color-primary)]/30">
                Register for Season 1
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/venues">
              <Button variant="outline" size="lg" className="h-12 px-8 text-base gap-2 border-[var(--color-border)] bg-white/5 backdrop-blur-sm">
                <Play className="h-4 w-4" />
                Browse venues
              </Button>
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.75, duration: 1 }}
            className="mt-10 flex flex-wrap gap-6 text-sm text-[var(--color-muted-foreground)]"
          >
            {['Super Over format', 'VR arena or Meta Quest', 'Skill-tier matchmaking'].map((item) => (
              <span key={item} className="flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-[var(--color-primary)]" />
                {item}
              </span>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Floating chips — anchored to the image area */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.95, duration: 0.6 }}
        className="absolute right-6 top-1/4 hidden lg:flex flex-col gap-2 z-20"
      >
        <span className="rounded-lg border border-[var(--color-primary)]/35 bg-[var(--color-card)]/75 backdrop-blur-md px-3 py-1.5 text-xs font-semibold text-[var(--color-primary)]">
          🏏 Super Over
        </span>
        <span className="rounded-lg border border-white/25 bg-[var(--color-card)]/75 backdrop-blur-md px-3 py-1.5 text-xs font-semibold text-white">
          6 balls only
        </span>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.3 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-[var(--color-muted-foreground)]"
      >
        <span className="text-xs uppercase tracking-widest">Scroll to explore</span>
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
          className="w-5 h-8 rounded-full border border-[var(--color-border)] flex justify-center pt-1.5"
        >
          <div className="w-1 h-2 rounded-full bg-[var(--color-primary)]" />
        </motion.div>
      </motion.div>
    </section>
  );
}
