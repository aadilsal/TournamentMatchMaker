import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Trophy, LogOut, User, MapPin, Calendar, Menu, X, Shield, Swords } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { SocketSyncProvider } from '@/components/sync/SocketSyncProvider';
import { Button, buttonVariants } from '@/components/ui/button';
import { getAccessToken, setAccessToken, apiPost } from '@/lib/api';
import { disconnectSocket } from '@/hooks/useSocket';
import { useAuthUser } from '@/hooks/useAuthUser';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/tournaments', label: 'Tournaments', icon: Trophy, auth: false },
  { href: '/venues', label: 'Venues', icon: MapPin, auth: false },
  { href: '/matches', label: 'Matches', icon: Swords, auth: true },
  { href: '/bookings', label: 'Bookings', icon: Calendar, auth: true },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const isLoggedIn = !!getAccessToken();
  const { isAdmin } = useAuthUser();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    try { await apiPost('/auth/logout'); } catch { /* proceed */ }
    setAccessToken(null);
    disconnectSocket();
    queryClient.clear();
    navigate('/login');
  };

  const isActive = (href: string) =>
    location.pathname === href || location.pathname.startsWith(href + '/');

  const visibleItems = navItems.filter((item) => !item.auth || isLoggedIn);

  return (
    <SocketSyncProvider>
    <div className="min-h-dvh flex flex-col bg-[var(--color-background)]">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-card)]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Logo */}
          <Link to={isLoggedIn ? '/tournaments' : '/'} className="flex items-center gap-2.5 font-bold text-base shrink-0">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/30">
              <Trophy className="h-4 w-4 text-[var(--color-primary)]" />
            </span>
            <span className="hidden sm:block tracking-tight">VR Cricket League</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-0.5" aria-label="Main navigation">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all duration-150',
                    active
                      ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                      : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)]'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-1.5 shrink-0">
            {isLoggedIn ? (
              <>
                <NotificationBell />
                {isAdmin && (
                  <Link
                    to="/admin"
                    className={buttonVariants({ variant: 'outline', size: 'sm', className: 'hidden sm:inline-flex' })}
                  >
                    Admin
                  </Link>
                )}
                <Link
                  to="/profile"
                  className={buttonVariants({
                    variant: 'ghost',
                    size: 'sm',
                    className: cn(
                      'hidden sm:inline-flex gap-1.5',
                      isActive('/profile') && 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                    ),
                  })}
                >
                  <User className="h-4 w-4" />
                  Profile
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleLogout}
                  className="text-[var(--color-muted-foreground)] hidden sm:inline-flex"
                  aria-label="Log out"
                  title="Log out"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <Link to="/login" className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'hidden sm:inline-flex' })}>
                  Log in
                </Link>
                <Link
                  to="/register"
                  className={buttonVariants({ size: 'sm', className: 'shadow-lg shadow-[var(--color-primary)]/20' })}
                >
                  Register
                </Link>
              </>
            )}

            {/* Mobile toggle */}
            <button
              type="button"
              className="md:hidden flex items-center justify-center h-10 w-10 rounded-md hover:bg-[var(--color-muted)] transition-colors"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
              aria-controls="app-mobile-nav"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden border-t border-[var(--color-border)] overflow-hidden"
            >
              <nav id="app-mobile-nav" aria-label="Main navigation" className="flex flex-col p-3 gap-1">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                        active
                          ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                          : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)]'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
                {isLoggedIn ? (
                  <>
                    {isAdmin && (
                      <Link
                        to="/admin"
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)]"
                      >
                        <Shield className="h-4 w-4" />
                        Admin
                      </Link>
                    )}
                    <Link
                      to="/profile"
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)]"
                    >
                      <User className="h-4 w-4" />
                      Profile
                    </Link>
                    <button
                      type="button"
                      onClick={() => { setMobileOpen(false); handleLogout(); }}
                      className="w-full text-left flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)]"
                    >
                      <LogOut className="h-4 w-4" />
                      Log out
                    </button>
                  </>
                ) : (
                  <Link
                    to="/login"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium text-[var(--color-muted-foreground)]"
                  >
                    Log in
                  </Link>
                )}
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Page content with entrance animation */}
      <motion.main
        key={location.pathname}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8"
      >
        {children}
      </motion.main>

      <footer className="border-t border-[var(--color-border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-xs text-[var(--color-muted-foreground)]">
          <span>© {new Date().getFullYear()} VR Cricket League</span>
          <nav aria-label="Legal" className="flex gap-4">
            <Link to="/terms" className="py-2 hover:text-[var(--color-foreground)]">Terms</Link>
            <Link to="/privacy" className="py-2 hover:text-[var(--color-foreground)]">Privacy</Link>
          </nav>
        </div>
      </footer>
    </div>
    </SocketSyncProvider>
  );
}
