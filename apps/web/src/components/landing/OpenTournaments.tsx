import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { ArrowRight, Calendar, Trophy, Users } from 'lucide-react';
import type { Tournament } from '@vr-tournament/shared';
import { apiGet } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { buttonVariants } from '@/components/ui/button';

const SHOWN = 3;

/** Live list of tournaments still open to join, each with a one-click Join. */
export function OpenTournaments() {
  const { data = [], isLoading } = useQuery({
    queryKey: ['tournaments', 'joinable'],
    queryFn: () => apiGet<Tournament[]>('/tournaments?status=open&limit=50'),
    staleTime: 60_000,
  });
  const now = Date.now();
  const open = data
    .filter((t) => t.playFormat === 'draw' && new Date(t.startDate).getTime() > now)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    .slice(0, SHOWN);

  return (
    <section id="tournaments" className="py-32">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-14">
          <p className="text-sm font-medium text-[var(--color-primary)] uppercase tracking-widest">Open now</p>
          <h2 className="mt-4 text-4xl sm:text-5xl font-bold tracking-tight">Pick a tournament and play</h2>
          <p className="mt-4 text-lg text-[var(--color-muted-foreground)] max-w-xl mx-auto">
            Join before it starts — at a VR arena near you or from home on your Meta Quest.
          </p>
        </div>

        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-3" aria-hidden>
            {Array.from({ length: SHOWN }, (_, i) => (
              <div key={i} className="h-56 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] animate-pulse" />
            ))}
          </div>
        ) : open.length === 0 ? (
          <div className="mx-auto max-w-xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-10 text-center">
            <Trophy className="mx-auto h-8 w-8 text-[var(--color-primary)]" />
            <p className="mt-4 text-lg font-semibold">New tournaments are on the way</p>
            <p className="mt-2 text-[var(--color-muted-foreground)]">
              Create your account now so you&rsquo;re ready to join the moment one opens.
            </p>
            <Link to="/register" className={buttonVariants({ size: 'lg', className: 'mt-6 gap-2' })}>
              Create my account <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className={`grid gap-6 ${open.length === 1 ? 'max-w-md mx-auto' : open.length === 2 ? 'md:grid-cols-2 max-w-4xl mx-auto' : 'md:grid-cols-3'}`}>
            {open.map((t, i) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ delay: i * 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="relative flex flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 transition-colors hover:border-[var(--color-primary)]/50"
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-[var(--color-primary)]" aria-hidden />
                <h3 className="text-xl font-semibold">{t.name}</h3>
                <div className="mt-4 space-y-2 text-sm text-[var(--color-muted-foreground)]">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" aria-hidden />
                    <span>Starts {formatDate(t.startDate)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" aria-hidden />
                    <span>
                      {t.registrationCount ?? 0}
                      {t.maxPlayers ? ` / ${t.maxPlayers}` : ''} players in
                    </span>
                  </div>
                </div>
                <Link to={`/join/${t.id}`} className={buttonVariants({ size: 'lg', className: 'mt-6 w-full gap-2' })}>
                  Join tournament <ArrowRight className="h-4 w-4" />
                </Link>
              </motion.div>
            ))}
          </div>
        )}

        <div className="mt-10 text-center">
          <Link to="/tournaments" className="text-sm font-medium text-[var(--color-muted-foreground)] underline hover:text-[var(--color-foreground)]">
            See all tournaments
          </Link>
        </div>
      </div>
    </section>
  );
}
