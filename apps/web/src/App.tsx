import { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useBlockSaveShortcut } from '@/hooks/useBlockSaveShortcut';
import { MarketingLayout } from '@/layouts/MarketingLayout';
import { RouteFallback } from '@/components/ui/route-fallback';
import { lazyNamed } from '@/lib/lazy-page';

const AppLayout = lazyNamed(() => import('@/layouts/AppLayout'), 'AppLayout');
const AdminLayout = lazyNamed(() => import('@/layouts/AdminLayout'), 'AdminLayout');
const AdminGuard = lazyNamed(() => import('@/components/admin/AdminGuard'), 'AdminGuard');

const LandingPage = lazyNamed(() => import('@/pages/LandingPage'), 'LandingPage');
const LoginPage = lazyNamed(() => import('@/pages/LoginPage'), 'LoginPage');
const RegisterPage = lazyNamed(() => import('@/pages/RegisterPage'), 'RegisterPage');
const ProfilePage = lazyNamed(() => import('@/pages/ProfilePage'), 'ProfilePage');
const VenuesPage = lazyNamed(() => import('@/pages/VenuesPage'), 'VenuesPage');
const VenueDetailPage = lazyNamed(() => import('@/pages/VenueDetailPage'), 'VenueDetailPage');
const BookingsPage = lazyNamed(() => import('@/pages/BookingsPage'), 'BookingsPage');
const TournamentsPage = lazyNamed(() => import('@/pages/TournamentsPage'), 'TournamentsPage');
const TournamentDetailPage = lazyNamed(() => import('@/pages/TournamentDetailPage'), 'TournamentDetailPage');
const MatchesPage = lazyNamed(() => import('@/pages/MatchesPage'), 'MatchesPage');
const PlayFlowPage = lazyNamed(() => import('@/pages/PlayFlowPage'), 'PlayFlowPage');
const PublicProfilePage = lazyNamed(() => import('@/pages/PublicProfilePage'), 'PublicProfilePage');
const WelcomePage = lazyNamed(() => import('@/pages/WelcomePage'), 'WelcomePage');

const AdminDashboardPage = lazyNamed(() => import('@/pages/admin/DashboardPage'), 'AdminDashboardPage');
const AdminMatchesPage = lazyNamed(() => import('@/pages/admin/MatchesPage'), 'AdminMatchesPage');
const AdminMatchDetailPage = lazyNamed(() => import('@/pages/admin/MatchDetailPage'), 'AdminMatchDetailPage');
const AdminTournamentsPage = lazyNamed(() => import('@/pages/admin/TournamentsPage'), 'AdminTournamentsPage');
const AdminTournamentDetailPage = lazyNamed(
  () => import('@/pages/admin/TournamentDetailPage'),
  'AdminTournamentDetailPage'
);
const AdminTournamentFormPage = lazyNamed(
  () => import('@/pages/admin/TournamentFormPage'),
  'AdminTournamentFormPage'
);
const AdminVenuesPage = lazyNamed(() => import('@/pages/admin/VenuesPage'), 'AdminVenuesPage');
const AdminVenueDetailPage = lazyNamed(() => import('@/pages/admin/VenueDetailPage'), 'AdminVenueDetailPage');
const AdminVenueFormPage = lazyNamed(() => import('@/pages/admin/VenueFormPage'), 'AdminVenueFormPage');
const AdminUsersPage = lazyNamed(() => import('@/pages/admin/UsersPage'), 'AdminUsersPage');
const AdminBookingsPage = lazyNamed(() => import('@/pages/admin/BookingsPage'), 'AdminBookingsPage');
const AdminQueuePage = lazyNamed(() => import('@/pages/admin/QueuePage'), 'AdminQueuePage');
const AdminBuybacksPage = lazyNamed(() => import('@/pages/admin/BuybacksPage'), 'AdminBuybacksPage');
const AdminNotificationsPage = lazyNamed(
  () => import('@/pages/admin/NotificationsPage'),
  'AdminNotificationsPage'
);
const AdminSystemPage = lazyNamed(() => import('@/pages/admin/SystemPage'), 'AdminSystemPage');
const AdminUserFormPage = lazyNamed(() => import('@/pages/admin/UserFormPage'), 'AdminUserFormPage');
const AdminUserDetailPage = lazyNamed(() => import('@/pages/admin/UserDetailPage'), 'AdminUserDetailPage');
const AdminMatchFormPage = lazyNamed(() => import('@/pages/admin/MatchFormPage'), 'AdminMatchFormPage');
const AdminBookingFormPage = lazyNamed(() => import('@/pages/admin/BookingFormPage'), 'AdminBookingFormPage');
const AdminBuybackDetailPage = lazyNamed(
  () => import('@/pages/admin/BuybackDetailPage'),
  'AdminBuybackDetailPage'
);
const AdminIntegrationsPage = lazyNamed(
  () => import('@/pages/admin/IntegrationsPage'),
  'AdminIntegrationsPage'
);

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<RouteFallback variant="app" />}>
      <AppLayout>
        <Suspense fallback={<RouteFallback variant="app-content" />}>{children}</Suspense>
      </AppLayout>
    </Suspense>
  );
}

function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<RouteFallback variant="admin" />}>
      <AdminGuard>
        <AdminLayout>
          <Suspense fallback={<RouteFallback variant="admin-content" />}>{children}</Suspense>
        </AdminLayout>
      </AdminGuard>
    </Suspense>
  );
}

export function App() {
  useBlockSaveShortcut();

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MarketingLayout />}>
          <Route
            path="/"
            element={
              <Suspense fallback={<RouteFallback variant="marketing" />}>
                <LandingPage />
              </Suspense>
            }
          />
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
