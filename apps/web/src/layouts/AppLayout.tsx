import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Tournament } from '@vr-tournament/shared';
import { ChevronDown, Home, LayoutDashboard, LogIn, LogOut, Medal, Shield, Trophy, User } from 'lucide-react';
import { motion } from 'motion/react';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { SocketSyncProvider } from '@/components/sync/SocketSyncProvider';
import { buttonVariants } from '@/components/ui/button';
import { getAccessToken, setAccessToken, apiGet, apiPost } from '@/lib/api';
import { API_URL } from '@/lib/config';
import { disconnectSocket } from '@/hooks/useSocket';
import { useAuthUser } from '@/hooks/useAuthUser';
import { useLiveStatsSync } from '@/hooks/useLiveStatsSync';
import { UnlockCelebration } from '@/components/achievements/UnlockCelebration';
import { cn } from '@/lib/utils';

type NavItem = { href: string; label: string; icon: typeof Trophy };

const playerNav: NavItem[] = [
  { href: '/my-tournaments', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/tournaments', label: 'Tournaments', icon: Trophy },
  { href: '/leaderboards', label: 'Leaderboards', icon: Medal },
];
const guestNav: NavItem[] = [
  { href: '/tournaments', label: 'Tournaments', icon: Trophy },
  { href: '/leaderboards', label: 'Leaderboards', icon: Medal },
];

function Logo({ to }: { to: string }) {
  return (
    <Link to={to} className="flex shrink-0 items-center gap-2.5" aria-label="VR Cricket League home">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#ff2d4b] to-[#b80f28] shadow-md shadow-[var(--color-primary)]/30">
        <Trophy className="h-4.5 w-4.5 text-white" aria-hidden />
      </span>
      <span className="leading-tight">
        <span className="block text-[15px] font-extrabold tracking-tight">VR Cricket League</span>
        <span className="block text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">by PixelPaddle</span>
      </span>
    </Link>
  );
}

/** Logged-in player menu: profile, admin, log out. */
function AccountMenu({ onLogout }: { onLogout: () => void }) {
  const { user, isAdmin } = useAuthUser();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  const name = user?.username ?? 'Player';
  const avatar = user?.hasProfilePicture ? `${API_URL}/api/v1/players/${name}/avatar?v=${encodeURIComponent(user.updatedAt)}` : null;
  const item = 'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm hover:bg-[var(--color-muted)]';
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Your account"
        className="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-muted)]/40 py-1 pl-1 pr-2 transition-colors hover:border-[var(--color-primary)]/60"
      >
        {avatar ? (
          <img src={avatar} alt="" className="h-7 w-7 rounded-full object-cover" />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-primary)]/20 text-xs font-bold text-[var(--color-primary)]">
            {name.charAt(0).toUpperCase()}
          </span>
        )}
        <ChevronDown className={cn('h-3.5 w-3.5 text-[var(--color-muted-foreground)] transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-56 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-1.5 shadow-2xl shadow-black/50">
          <div className="border-b border-[var(--color-border)] px-3 pb-2 pt-1.5">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="text-xs text-[var(--color-muted-foreground)]">Tier {user?.skillTier ?? '—'}</p>
          </div>
          <div className="pt-1.5">
            <Link role="menuitem" to="/profile" onClick={() => setOpen(false)} className={item}><User className="h-4 w-4" aria-hidden />Profile &amp; stats</Link>
            <Link role="menuitem" to="/my-tournaments" onClick={() => setOpen(false)} className={item}><LayoutDashboard className="h-4 w-4" aria-hidden />Dashboard</Link>
            {isAdmin && (
              <Link role="menuitem" to="/admin" onClick={() => setOpen(false)} className={item}><Shield className="h-4 w-4" aria-hidden />Admin panel</Link>
            )}
            <button role="menuitem" type="button" onClick={() => { setOpen(false); onLogout(); }} className={cn(item, 'text-[var(--color-muted-foreground)]')}>
              <LogOut className="h-4 w-4" aria-hidden />Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const isLoggedIn = !!getAccessToken();
  useLiveStatsSync(isLoggedIn);

  // "Live now" chip when any tournament is being played.
  const live = useQuery({
    queryKey: ['tournaments', 'live-count'],
    queryFn: () => apiGet<Tournament[]>('/tournaments?status=in_progress&limit=1'),
    staleTime: 60_000,
  });
  const liveCount = live.data?.length ?? 0;

  const handleLogout = async () => {
    try { await apiPost('/auth/logout'); } catch { /* proceed */ }
    setAccessToken(null);
    disconnectSocket();
    queryClient.clear();
    navigate('/login');
  };

  const isActive = (href: string) => location.pathname === href || location.pathname.startsWith(href + '/');
  const nav = isLoggedIn ? playerNav : guestNav;
  // Phones get an app-style tab bar instead of a hamburger menu.
  const tabs: NavItem[] = isLoggedIn
    ? [...playerNav, { href: '/profile', label: 'Profile', icon: User }]
    : [{ href: '/', label: 'Home', icon: Home }, ...guestNav, { href: '/login', label: 'Log in', icon: LogIn }];

  return (
    <SocketSyncProvider>
    <div className="flex min-h-dvh flex-col bg-[var(--color-background)]">
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[var(--color-background)]/75 backdrop-blur-xl supports-[backdrop-filter]:bg-[var(--color-background)]/60">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6">
          <Logo to={isLoggedIn ? '/my-tournaments' : '/'} />

          <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
            {nav.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors',
                    active ? 'text-[var(--color-foreground)]' : 'text-[var(--color-muted-foreground)] hover:bg-white/[0.04] hover:text-[var(--color-foreground)]'
                  )}
                >
                  <Icon className={cn('h-4 w-4', active && 'text-[var(--color-primary)]')} aria-hidden />
                  {item.label}
                  {active && (
                    <motion.span layoutId="nav-underline" className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-[var(--color-primary)]" />
                  )}
                </Link>
              );
            })}
            {liveCount > 0 && (
              <Link to="/tournaments" title="A tournament is being played right now" className="ml-2 flex items-center gap-1.5 rounded-full border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 px-2.5 py-1 text-xs font-semibold text-[var(--color-primary)]">
                <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-primary)] opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-primary)]" /></span>
                Live now
              </Link>
            )}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            {isLoggedIn ? (
              <>
                <NotificationBell />
                <AccountMenu onLogout={handleLogout} />
              </>
            ) : (
              <>
                <Link to="/login" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)] sm:inline-flex">
                  Log in
                </Link>
                <Link to="/register" title="Create your free account" className={buttonVariants({ size: 'sm', className: 'px-4' })}>
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <motion.main
        key={location.pathname}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8"
      >
        {children}
      </motion.main>
      <UnlockCelebration enabled={isLoggedIn} />

      <footer className="border-t border-white/[0.06] bg-[var(--color-card)]/40 pb-20 md:pb-0">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="space-y-3">
            <Logo to="/" />
            <p className="max-w-xs text-sm text-[var(--color-muted-foreground)]">
              Super Over to T20 cricket in VR. Play at an arena near you or from home on your Meta Quest.
            </p>
          </div>
          {[
            { title: 'Play', links: [['/tournaments', 'Tournaments'], ['/leaderboards', 'Leaderboards'], ['/#how-it-works', 'How it works']] },
            {
              title: 'Account',
              links: isLoggedIn
                ? [['/my-tournaments', 'Dashboard'], ['/profile', 'Profile & stats'], ['/join', 'Join a tournament']]
                : [['/register', 'Create account'], ['/login', 'Log in'], ['/forgot-password', 'Reset password']],
            },
            { title: 'PixelPaddle', links: [['/terms', 'Terms'], ['/privacy', 'Privacy']] },
          ].map((col) => (
            <nav key={col.title} aria-label={col.title} className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-foreground)]">{col.title}</p>
              <ul className="space-y-2 text-sm">
                {col.links.map(([href, label]) => (
                  <li key={href}>
                    <Link to={href} className="text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]">{label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="border-t border-white/[0.06]">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-[var(--color-muted-foreground)] sm:px-6">
            <span>© {new Date().getFullYear()} PixelPaddle. All rights reserved.</span>
            <span>Made for Meta Quest · VR Cricket League</span>
          </div>
        </div>
      </footer>

      {/* Phones: app-style tab bar. */}
      <nav
        aria-label="Main navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-[var(--color-background)]/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      >
        <ul className="grid grid-cols-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = tab.href === '/' ? location.pathname === '/' : isActive(tab.href);
            return (
              <li key={tab.href}>
                <Link
                  to={tab.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                    active ? 'text-[var(--color-primary)]' : 'text-[var(--color-muted-foreground)]'
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
    </SocketSyncProvider>
  );
}
