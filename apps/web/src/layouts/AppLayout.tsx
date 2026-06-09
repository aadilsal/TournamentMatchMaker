import { Link, useNavigate } from 'react-router-dom';
import { Gamepad2, LogOut, User, MapPin, Calendar, Swords, Trophy } from 'lucide-react';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { Button } from '@/components/ui/button';
import { getAccessToken, setAccessToken, apiPost } from '@/lib/api';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const isLoggedIn = !!getAccessToken();

  const handleLogout = async () => {
    try {
      await apiPost('/auth/logout');
    } catch {
      // proceed with local logout
    }
    setAccessToken(null);
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-card)]">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold text-lg">
            <Gamepad2 className="h-6 w-6 text-[var(--color-primary)]" />
            VR Tournament
          </Link>

          <nav className="flex items-center gap-4">
            <Link to="/venues" className="flex items-center gap-1 text-sm hover:text-[var(--color-primary)]">
              <MapPin className="h-4 w-4" /> Venues
            </Link>
            {isLoggedIn && (
              <>
                <Link to="/tournaments" className="flex items-center gap-1 text-sm hover:text-[var(--color-primary)]">
                  <Trophy className="h-4 w-4" /> Tournaments
                </Link>
                <Link to="/matchmaking" className="flex items-center gap-1 text-sm hover:text-[var(--color-primary)]">
                  <Swords className="h-4 w-4" /> Queue
                </Link>
                <Link to="/matches" className="flex items-center gap-1 text-sm hover:text-[var(--color-primary)]">
                  <Trophy className="h-4 w-4" /> Matches
                </Link>
                <Link to="/bookings" className="flex items-center gap-1 text-sm hover:text-[var(--color-primary)]">
                  <Calendar className="h-4 w-4" /> Bookings
                </Link>
                <Link to="/profile" className="flex items-center gap-1 text-sm hover:text-[var(--color-primary)]">
                  <User className="h-4 w-4" /> Profile
                </Link>
                <NotificationBell />
                <Button variant="ghost" size="sm" onClick={handleLogout}>
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            )}
            {!isLoggedIn && (
              <>
                <Link to="/login">
                  <Button variant="ghost" size="sm">Login</Button>
                </Link>
                <Link to="/register">
                  <Button size="sm">Register</Button>
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
