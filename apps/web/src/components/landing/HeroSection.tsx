import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowRight, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function HeroSection() {
  return (
    <section className="relative min-h-[100svh] flex items-center justify-center overflow-hidden pt-16">
      <div className="landing-orb landing-orb-1" aria-hidden />
      <div className="landing-orb landing-orb-2" aria-hidden />
      <div className="landing-grid" aria-hidden />

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-24 text-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 px-4 py-1.5 text-xs font-medium text-[var(--color-accent-foreground)] mb-8">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live — venues, tournaments & matchmaking
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight leading-[1.05] max-w-5xl mx-auto"
        >
          Compete in VR.
          <br />
          <span className="landing-gradient-text">Anywhere. Anyone.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.25 }}
          className="mt-8 text-lg sm:text-xl text-[var(--color-muted-foreground)] max-w-2xl mx-auto leading-relaxed"
        >
          The tournament platform built for Tekken-style PvP — find venues near you,
          book arena slots, and get randomly matched with your next opponent. Meta Quest or arena, you play.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Link to="/register">
            <Button size="lg" className="h-12 px-8 text-base gap-2 shadow-xl shadow-[var(--color-primary)]/30">
              Create player profile
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link to="/venues">
            <Button variant="outline" size="lg" className="h-12 px-8 text-base gap-2 border-[var(--color-border)] bg-white/5 backdrop-blur-sm">
              <Play className="h-4 w-4" />
              Explore venues
            </Button>
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 1 }}
          className="mt-20 flex flex-wrap justify-center gap-8 text-sm text-[var(--color-muted-foreground)]"
        >
          {['PostGIS venue search', 'Real-time slot booking', 'Random matchmaking'].map((item) => (
            <span key={item} className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-[var(--color-primary)]" />
              {item}
            </span>
          ))}
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
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
