import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function CTASection() {
  return (
    <section className="py-32 relative overflow-hidden">
      <div className="landing-orb landing-orb-3" aria-hidden />
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="relative rounded-3xl border border-[var(--color-primary)]/30 bg-gradient-to-br from-[var(--color-primary)]/20 via-[var(--color-card)] to-[var(--color-background)] p-12 sm:p-16 text-center overflow-hidden"
        >
          <div className="landing-grid absolute inset-0 opacity-30" aria-hidden />
          <div className="relative z-10">
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight max-w-2xl mx-auto">
              Ready to enter the queue?
            </h2>
            <p className="mt-6 text-lg text-[var(--color-muted-foreground)] max-w-xl mx-auto">
              Join players across Lahore, Karachi, and beyond. Create your profile,
              book your first slot, and enter the matchmaking queue.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/register">
                <Button size="lg" className="h-12 px-10 text-base gap-2">
                  Start free
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/venues">
                <Button variant="outline" size="lg" className="h-12 px-10 text-base bg-transparent">
                  Browse venues first
                </Button>
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
