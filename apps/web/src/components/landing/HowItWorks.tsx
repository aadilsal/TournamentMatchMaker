import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { UserPlus, Search, Swords } from 'lucide-react';

const steps = [
  {
    icon: UserPlus,
    title: 'Create your fighter profile',
    body: 'Set your skill tier, VR headset status, and city. One account for venues, bookings, and tournaments.',
  },
  {
    icon: Search,
    title: 'Find & book a venue',
    body: 'Search by proximity or city. Pick an open slot and confirm — your seat is locked in under a second.',
  },
  {
    icon: Swords,
    title: 'Queue & compete',
    body: 'Join matchmaking when Phase 3 ships. Get paired, notified, and bracketed — headset or arena.',
  },
];

export function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.8', 'end 0.4'] });
  const lineScale = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <section id="how-it-works" ref={ref} className="py-32 bg-[var(--color-card)]/40 border-y border-[var(--color-border)]/50">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-20">
          <p className="text-sm font-medium text-[var(--color-primary)] uppercase tracking-widest">How it works</p>
          <h2 className="mt-4 text-4xl sm:text-5xl font-bold tracking-tight">Three steps to your first match</h2>
        </div>

        <div className="relative max-w-3xl mx-auto">
          <div className="absolute left-6 top-0 bottom-0 w-px bg-[var(--color-border)] hidden sm:block">
            <motion.div
              className="w-full bg-[var(--color-primary)] origin-top"
              style={{ scaleY: lineScale, height: '100%' }}
            />
          </div>

          <div className="space-y-16">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.title}
                  initial={{ opacity: 0, x: -24 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{ delay: i * 0.15, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  className="relative flex gap-8 sm:pl-16"
                >
                  <div className="hidden sm:flex absolute left-0 h-12 w-12 items-center justify-center rounded-full bg-[var(--color-background)] border-2 border-[var(--color-primary)] z-10">
                    <Icon className="h-5 w-5 text-[var(--color-primary)]" />
                  </div>
                  <div className="sm:hidden flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/30">
                    <Icon className="h-5 w-5 text-[var(--color-primary)]" />
                  </div>
                  <div>
                    <span className="text-xs font-mono text-[var(--color-muted-foreground)]">Step {i + 1}</span>
                    <h3 className="mt-2 text-2xl font-semibold">{step.title}</h3>
                    <p className="mt-3 text-[var(--color-muted-foreground)] leading-relaxed">{step.body}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
