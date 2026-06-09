import { motion } from 'motion/react';
import { Globe, Shield, Zap, Headset, BarChart3, Lock } from 'lucide-react';

const features = [
  {
    icon: Globe,
    title: 'PostGIS proximity',
    description: 'Venues ranked by real distance. GIST-indexed queries return results in milliseconds.',
    className: 'md:col-span-2 md:row-span-1',
    large: true,
  },
  {
    icon: Lock,
    title: 'Conflict-safe booking',
    description: 'FOR UPDATE row locks + Redis slot locks prevent race conditions under load.',
    className: 'md:col-span-1',
  },
  {
    icon: Headset,
    title: 'VR or venue play',
    description: 'Own a headset? Play remote. No headset? We book the nearest shared arena.',
    className: 'md:col-span-1',
  },
  {
    icon: BarChart3,
    title: 'Random queues',
    description: 'Tekken-style random pairing — jump in fast and fight whoever\'s next in line.',
    className: 'md:col-span-1',
  },
  {
    icon: Zap,
    title: 'Sub-second API',
    description: 'Redis caching, connection pooling, horizontal scaling — built for 10k+ concurrent users.',
    className: 'md:col-span-2',
    large: true,
  },
  {
    icon: Shield,
    title: 'Production security',
    description: 'JWT rotation, RBAC, rate limiting, bcrypt — enterprise-grade from day one.',
    className: 'md:col-span-1',
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.6, ease: 'easeOut' as const },
  }),
};

export function FeaturesBento() {
  return (
    <section id="features" className="py-32 relative">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={fadeUp}
          custom={0}
          className="text-center max-w-3xl mx-auto mb-16"
        >
          <p className="text-sm font-medium text-[var(--color-primary)] uppercase tracking-widest">Platform</p>
          <h2 className="mt-4 text-4xl sm:text-5xl font-bold tracking-tight">
            Engineered for competitive scale
          </h2>
          <p className="mt-6 text-lg text-[var(--color-muted-foreground)]">
            Every layer — from PostGIS indexes to Redis matchmaking queues — designed
            the way elite teams ship production platforms.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-fr">
          {features.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.title}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-40px' }}
                variants={fadeUp}
                custom={i + 1}
                className={`landing-bento-card group ${feature.className}`}
              >
                <div className="flex h-full flex-col p-6 sm:p-8">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/25 group-hover:bg-[var(--color-primary)]/25 transition-colors">
                    <Icon className="h-5 w-5 text-[var(--color-primary)]" />
                  </div>
                  <h3 className={`mt-6 font-semibold ${feature.large ? 'text-2xl' : 'text-xl'}`}>
                    {feature.title}
                  </h3>
                  <p className="mt-3 text-[var(--color-muted-foreground)] leading-relaxed flex-1">
                    {feature.description}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
