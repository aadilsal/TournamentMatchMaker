import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useBlockSaveShortcut } from '@/hooks/useBlockSaveShortcut';
import { MarketingLayout } from '@/layouts/MarketingLayout';
import { AppLayout } from '@/layouts/AppLayout';
import { AdminLayout } from '@/layouts/AdminLayout';
import { AdminGuard } from '@/components/admin/AdminGuard';
import { LandingPage } from '@/pages/LandingPage';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { VenuesPage } from '@/pages/VenuesPage';
import { VenueDetailPage } from '@/pages/VenueDetailPage';
import { BookingsPage } from '@/pages/BookingsPage';
import { TournamentsPage } from '@/pages/TournamentsPage';
import { TournamentDetailPage } from '@/pages/TournamentDetailPage';
import { MatchesPage } from '@/pages/MatchesPage';
import { PlayFlowPage } from '@/pages/PlayFlowPage';
import { PublicProfilePage } from '@/pages/PublicProfilePage';
import { WelcomePage } from '@/pages/WelcomePage';
import { AdminDashboardPage } from '@/pages/admin/DashboardPage';
import { AdminMatchesPage } from '@/pages/admin/MatchesPage';
import { AdminMatchDetailPage } from '@/pages/admin/MatchDetailPage';
import { AdminTournamentsPage } from '@/pages/admin/TournamentsPage';
import { AdminTournamentDetailPage } from '@/pages/admin/TournamentDetailPage';
import { AdminTournamentFormPage } from '@/pages/admin/TournamentFormPage';
import { AdminVenuesPage } from '@/pages/admin/VenuesPage';
import { AdminVenueDetailPage } from '@/pages/admin/VenueDetailPage';
import { AdminVenueFormPage } from '@/pages/admin/VenueFormPage';
import { AdminUsersPage } from '@/pages/admin/UsersPage';
import { AdminBookingsPage } from '@/pages/admin/BookingsPage';
import { AdminQueuePage } from '@/pages/admin/QueuePage';
import { AdminBuybacksPage } from '@/pages/admin/BuybacksPage';
import { AdminNotificationsPage } from '@/pages/admin/NotificationsPage';
import { AdminSystemPage } from '@/pages/admin/SystemPage';
import { AdminUserFormPage } from '@/pages/admin/UserFormPage';
import { AdminUserDetailPage } from '@/pages/admin/UserDetailPage';
import { AdminMatchFormPage } from '@/pages/admin/MatchFormPage';
import { AdminBookingFormPage } from '@/pages/admin/BookingFormPage';
import { AdminBuybackDetailPage } from '@/pages/admin/BuybackDetailPage';
import { AdminIntegrationsPage } from '@/pages/admin/IntegrationsPage';

function AppShell({ children }: { children: React.ReactNode }) {
  return <AppLayout>{children}</AppLayout>;
}

function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <AdminGuard>
      <AdminLayout>{children}</AdminLayout>
    </AdminGuard>
  );
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
        <Route path="/play" element={<AppShell><PlayFlowPage /></AppShell>} />
        <Route path="/players/:username" element={<AppShell><PublicProfilePage /></AppShell>} />
        <Route path="/welcome" element={<AppShell><WelcomePage /></AppShell>} />
        <Route path="/profile" element={<AppShell><ProfilePage /></AppShell>} />
        <Route path="/venues" element={<AppShell><VenuesPage /></AppShell>} />
        <Route path="/venues/:id" element={<AppShell><VenueDetailPage /></AppShell>} />
        <Route path="/bookings" element={<AppShell><BookingsPage /></AppShell>} />
        <Route path="/tournaments" element={<AppShell><TournamentsPage /></AppShell>} />
        <Route path="/tournaments/:id" element={<AppShell><TournamentDetailPage /></AppShell>} />
        <Route path="/matchmaking" element={<Navigate to="/tournaments" replace />} />
        <Route path="/matches" element={<AppShell><MatchesPage /></AppShell>} />

        {/* Admin panel */}
        <Route path="/admin" element={<AdminShell><AdminDashboardPage /></AdminShell>} />
        <Route path="/admin/matches" element={<AdminShell><AdminMatchesPage /></AdminShell>} />
        <Route path="/admin/matches/new" element={<AdminShell><AdminMatchFormPage /></AdminShell>} />
        <Route path="/admin/matches/:id" element={<AdminShell><AdminMatchDetailPage /></AdminShell>} />
        <Route path="/admin/tournaments" element={<AdminShell><AdminTournamentsPage /></AdminShell>} />
        <Route path="/admin/tournaments/new" element={<AdminShell><AdminTournamentFormPage /></AdminShell>} />
        <Route path="/admin/tournaments/:id/edit" element={<AdminShell><AdminTournamentFormPage /></AdminShell>} />
        <Route path="/admin/tournaments/:id" element={<AdminShell><AdminTournamentDetailPage /></AdminShell>} />
        <Route path="/admin/venues" element={<AdminShell><AdminVenuesPage /></AdminShell>} />
        <Route path="/admin/venues/new" element={<AdminShell><AdminVenueFormPage /></AdminShell>} />
        <Route path="/admin/venues/:id/edit" element={<AdminShell><AdminVenueFormPage /></AdminShell>} />
        <Route path="/admin/venues/:id" element={<AdminShell><AdminVenueDetailPage /></AdminShell>} />
        <Route path="/admin/users" element={<AdminShell><AdminUsersPage /></AdminShell>} />
        <Route path="/admin/users/new" element={<AdminShell><AdminUserFormPage /></AdminShell>} />
        <Route path="/admin/users/:id" element={<AdminShell><AdminUserDetailPage /></AdminShell>} />
        <Route path="/admin/bookings" element={<AdminShell><AdminBookingsPage /></AdminShell>} />
        <Route path="/admin/bookings/new" element={<AdminShell><AdminBookingFormPage /></AdminShell>} />
        <Route path="/admin/queue" element={<AdminShell><AdminQueuePage /></AdminShell>} />
        <Route path="/admin/buybacks" element={<AdminShell><AdminBuybacksPage /></AdminShell>} />
        <Route path="/admin/buybacks/:id" element={<AdminShell><AdminBuybackDetailPage /></AdminShell>} />
        <Route path="/admin/notifications" element={<AdminShell><AdminNotificationsPage /></AdminShell>} />
        <Route path="/admin/integrations" element={<AdminShell><AdminIntegrationsPage /></AdminShell>} />
        <Route path="/admin/system" element={<AdminShell><AdminSystemPage /></AdminShell>} />
      </Routes>
    </BrowserRouter>
  );
}
