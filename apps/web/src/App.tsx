import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useBlockSaveShortcut } from '@/hooks/useBlockSaveShortcut';
import { MarketingLayout } from '@/layouts/MarketingLayout';
import { AppLayout } from '@/layouts/AppLayout';
import { LandingPage } from '@/pages/LandingPage';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { VenuesPage } from '@/pages/VenuesPage';
import { VenueDetailPage } from '@/pages/VenueDetailPage';
import { BookingsPage } from '@/pages/BookingsPage';
import { TournamentsPage } from '@/pages/TournamentsPage';
import { TournamentDetailPage } from '@/pages/TournamentDetailPage';
import { MatchmakingPage } from '@/pages/MatchmakingPage';
import { MatchesPage } from '@/pages/MatchesPage';
import { WelcomePage } from '@/pages/WelcomePage';

function AppShell({ children }: { children: React.ReactNode }) {
  return <AppLayout>{children}</AppLayout>;
}

export function App() {
  useBlockSaveShortcut();

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MarketingLayout />}>
          <Route path="/" element={<LandingPage />} />
        </Route>

        <Route path="/login" element={<AppShell><LoginPage /></AppShell>} />
        <Route path="/register" element={<AppShell><RegisterPage /></AppShell>} />
        <Route path="/welcome" element={<AppShell><WelcomePage /></AppShell>} />
        <Route path="/profile" element={<AppShell><ProfilePage /></AppShell>} />
        <Route path="/venues" element={<AppShell><VenuesPage /></AppShell>} />
        <Route path="/venues/:id" element={<AppShell><VenueDetailPage /></AppShell>} />
        <Route path="/bookings" element={<AppShell><BookingsPage /></AppShell>} />
        <Route path="/tournaments" element={<AppShell><TournamentsPage /></AppShell>} />
        <Route path="/tournaments/:id" element={<AppShell><TournamentDetailPage /></AppShell>} />
        <Route path="/matchmaking" element={<AppShell><MatchmakingPage /></AppShell>} />
        <Route path="/matches" element={<AppShell><MatchesPage /></AppShell>} />
      </Routes>
    </BrowserRouter>
  );
}
