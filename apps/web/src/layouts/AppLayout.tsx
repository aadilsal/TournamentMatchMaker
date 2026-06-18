import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Trophy, LogOut, User, MapPin, Calendar, Menu, X, Target } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { Button } from '@/components/ui/button';
import { getAccessToken, setAccessToken, apiPost } from '@/lib/api';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/play', label: 'Play', icon: Target, auth: true },
  { href: '/venues', label: 'Venues', icon: MapPin, auth: false },
  { href: '/tournaments', label: 'Tournaments', icon: Trophy, auth: true },
  { href: '/matches', label: 'Matches', icon: Target, auth: true },
  { href: '/bookings', label: 'Bookings', icon: Calendar, auth: true },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isLoggedIn = !!getAccessToken();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    try { await apiPost('/auth/logout'); } catch { /* proceed */ }
    setAccessToken(null);
    navigate('/login');
  };

  const isActive = (href: string) =>
    location.pathname === href || location.pathname.startsWith(href + '/');

  const visibleItems = navItems.filter((item) => !item.auth || isLoggedIn);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-background)]">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-card)]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 font-bold text-base shrink-0">
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
                <Link to="/profile">
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'hidden sm:inline-flex gap-1.5',
                      isActive('/profile') && 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                    )}
                  >
                    <User className="h-4 w-4" />
                    Profile
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLogout}
                  className="text-[var(--color-muted-foreground)] hidden sm:inline-flex"
                  title="Log out"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <Link to="/login" className="hidden sm:block">
                  <Button variant="ghost" size="sm">Log in</Button>
                </Link>
                <Link to="/register">
                  <Button size="sm" className="shadow-lg shadow-[var(--color-primary)]/20">
                    Register
                  </Button>
                </Link>
              </>
            )}

            {/* Mobile toggle */}
            <button
              className="md:hidden flex items-center justify-center h-8 w-8 rounded-md hover:bg-[var(--color-muted)] transition-colors"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
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
              <nav className="flex flex-col p-3 gap-1">
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
                    <Link
                      to="/profile"
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)]"
                    >
                      <User className="h-4 w-4" />
                      Profile
                    </Link>
                    <button
                      onClick={() => { setMobileOpen(false); handleLogout(); }}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)]"
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
    </div>
  );
}
