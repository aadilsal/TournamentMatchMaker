import { motion, useInView } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

const stats = [
  { value: 50, suffix: 'km', label: 'Venue search radius' },
  { value: 10000, suffix: '+', label: 'Concurrent users target', format: (n: number) => `${Math.round(n / 1000)}k` },
  { value: 500, suffix: '/s', label: 'Peak registrations' },
  { value: 99, suffix: '%', label: 'Booking integrity' },
];

function AnimatedStat({
  value,
  suffix,
  label,
  format,
}: {
  value: number;
  suffix: string;
  label: string;
  format?: (n: number) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const duration = 1200;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setCount(Math.round(value * eased));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [inView, value]);

  const display = format ? format(count) : String(count);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="text-center px-6"
    >
      <div className="text-4xl sm:text-5xl font-bold tracking-tight landing-gradient-text">
        {display}{suffix}
      </div>
      <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">{label}</p>
    </motion.div>
  );
}

export function StatsSection() {
  return (
    <section className="py-24 border-b border-[var(--color-border)]/50">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-12">
          {stats.map((stat) => (
            <AnimatedStat key={stat.label} {...stat} />
          ))}
        </div>
      </div>
    </section>
  );
}
