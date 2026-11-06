import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Swords,
  Trophy,
  MapPin,
  Users,
  Calendar,
  Bell,
  CreditCard,
  Radio,
  Settings,
  LogOut,
  Menu,
  X,
  ExternalLink,
} from 'lucide-react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { apiPost, setAccessToken } from '@/lib/api';
import { disconnectSocket } from '@/hooks/useSocket';
import { useAuthUser } from '@/hooks/useAuthUser';
import type { UserRole } from '@vr-tournament/shared';
import { canAccessAdminPath } from '@/lib/admin-routes';
import { cn } from '@/lib/utils';
import { roleLabel } from '@/lib/format';

const allNav = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/matches', label: 'Matches', icon: Swords },
  { href: '/admin/tournaments', label: 'Tournaments', icon: Trophy },
  { href: '/admin/venues', label: 'Venues', icon: MapPin },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/bookings', label: 'Bookings', icon: Calendar },
  { href: '/admin/queue', label: 'Queue', icon: Radio },
  { href: '/admin/buybacks', label: 'Buybacks', icon: CreditCard },
  { href: '/admin/notifications', label: 'Notifications', icon: Bell },
  { href: '/admin/integrations', label: 'Integrations', icon: Settings },
  { href: '/admin/system', label: 'System', icon: Settings },
];

function navForRole(role?: UserRole) {
  return allNav.filter((n) => canAccessAdminPath(n.href, role));
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthUser();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await apiPost('/auth/logout');
    } catch {
      /* proceed */
    }
    setAccessToken(null);
    disconnectSocket();
    queryClient.clear();
    navigate('/login');
  };

  const isActive = (href: string, exact?: boolean) =>
    exact ? location.pathname === href : location.pathname.startsWith(href);

  const visibleNav = navForRole(user?.role);

  const FooterLinks = () => (
    <>
      <Link
        to="/tournaments"
        onClick={() => setOpen(false)}
        className="flex min-h-10 items-center gap-2 px-3 py-2 rounded-lg text-sm text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
      >
        <ExternalLink className="h-4 w-4" />
        Player app
      </Link>
      <Button variant="ghost" className="w-full justify-start gap-2 px-3" onClick={handleLogout}>
        <LogOut className="h-4 w-4" />
        Log out
      </Button>
    </>
  );

  const NavLinks = () => (
    <>
      {visibleNav.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.href, item.exact);
        return (
          <Link
            key={item.href}
            to={item.href}
            onClick={() => setOpen(false)}
            className={cn(
              'flex min-h-10 items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              active
                ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]'
                : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="min-h-dvh flex bg-[var(--color-background)]">
      <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-card)]">
        <div className="p-4 border-b border-[var(--color-border)]">
          <p className="font-bold text-sm tracking-tight">Admin Panel</p>
          <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5 truncate">
            {user?.username} · {roleLabel(user?.role)}
          </p>
        </div>
        <nav aria-label="Admin navigation" className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          <NavLinks />
        </nav>
        <div className="p-3 border-t border-[var(--color-border)] space-y-1">
          <FooterLinks />
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-14 border-b border-[var(--color-border)] bg-[var(--color-card)]">
          <span className="font-semibold text-sm">Admin</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(!open)}
            aria-label={open ? 'Close admin menu' : 'Open admin menu'}
            aria-expanded={open}
            aria-controls="admin-mobile-nav"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </header>

        {open && (
          <nav
            id="admin-mobile-nav"
            aria-label="Admin navigation"
            className="lg:hidden border-b border-[var(--color-border)] bg-[var(--color-card)] p-3 space-y-0.5"
          >
            <NavLinks />
            <div className="mt-2 border-t border-[var(--color-border)] pt-2 space-y-0.5">
              <p className="px-3 pb-1 text-xs text-[var(--color-muted-foreground)] truncate">
                {user?.username} · {roleLabel(user?.role)}
              </p>
              <FooterLinks />
            </div>
          </nav>
        )}

        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
