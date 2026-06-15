import { motion } from 'motion/react';
import { Target, Layers, MapPin, Users, BarChart3, Shield } from 'lucide-react';

const features = [
  {
    icon: Target,
    title: 'Realistic VR cricket',
    description: 'Full batting, bowling and fielding simulation. Ball trajectory physics, bat tracking and wicket detection — built for competitive match play.',
  },
  {
    icon: Layers,
    title: 'Super Over format',
    description: '6 balls. Maximum pressure. The Super Over format distils cricket to its purest, most intense moment — every delivery counts.',
  },
  {
    icon: MapPin,
    title: 'VR cricket arenas',
    description: 'No headset? No problem. Find a certified VR cricket venue within 50km — we handle the slot booking.',
  },
  {
    icon: Users,
    title: 'Skill-tier matchmaking',
    description: 'Matched by tier, not by luck. Fast queue-based pairing gets you into your first over in seconds.',
  },
  {
    icon: BarChart3,
    title: 'Live national leaderboard',
    description: 'Real-time rankings, tournament brackets and match history. Climb the national ladder across Canada.',
  },
  {
    icon: Shield,
    title: 'Guaranteed slots',
    description: 'Book your arena time and it\'s yours — no last-minute surprises, no conflicts. Your slot is locked the moment you confirm.',
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
            Built for serious cricket competition
          </h2>
          <p className="mt-6 text-lg text-[var(--color-muted-foreground)]">
            Everything you need to register, compete, and track your progress in
            Canada's first VR cricket tournament — built to run without a hitch.
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
                className="landing-bento-card group"
              >
                <div className="flex h-full flex-col p-6 sm:p-8">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/25 group-hover:bg-[var(--color-primary)]/25 transition-colors">
                    <Icon className="h-5 w-5 text-[var(--color-primary)]" />
                  </div>
                  <h3 className="mt-6 text-xl font-semibold">
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
