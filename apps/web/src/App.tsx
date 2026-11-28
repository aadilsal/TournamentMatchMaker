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
const StartPage = lazyNamed(() => import('@/pages/StartPage'), 'StartPage');
const ChooseTournamentPage = lazyNamed(() => import('@/pages/ChooseTournamentPage'), 'ChooseTournamentPage');
const ChooseWherePage = lazyNamed(() => import('@/pages/ChooseWherePage'), 'ChooseWherePage');
const MyTournamentsPage = lazyNamed(() => import('@/pages/MyTournamentsPage'), 'MyTournamentsPage');
const TournamentsPage = lazyNamed(() => import('@/pages/TournamentsPage'), 'TournamentsPage');
const TournamentDetailPage = lazyNamed(() => import('@/pages/TournamentDetailPage'), 'TournamentDetailPage');
const LiveMatchPage = lazyNamed(() => import('@/pages/LiveMatchPage'), 'LiveMatchPage');
const PublicProfilePage = lazyNamed(() => import('@/pages/PublicProfilePage'), 'PublicProfilePage');
const LeaderboardsPage = lazyNamed(() => import('@/pages/LeaderboardsPage'), 'LeaderboardsPage');
const ForgotPasswordPage = lazyNamed(() => import('@/pages/ForgotPasswordPage'), 'ForgotPasswordPage');
const ResetPasswordPage = lazyNamed(() => import('@/pages/ResetPasswordPage'), 'ResetPasswordPage');
const AutoLoginPage = lazyNamed(() => import('@/pages/AutoLoginPage'), 'AutoLoginPage');
const TermsPage = lazyNamed(() => import('@/pages/LegalPage'), 'TermsPage');
const PrivacyPage = lazyNamed(() => import('@/pages/LegalPage'), 'PrivacyPage');
const NotFoundPage = lazyNamed(() => import('@/pages/NotFoundPage'), 'NotFoundPage');

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
        <Route path="/forgot-password" element={<AppShell><ForgotPasswordPage /></AppShell>} />
        <Route path="/reset-password" element={<AppShell><ResetPasswordPage /></AppShell>} />
        <Route path="/auto-login" element={<AppShell><AutoLoginPage /></AppShell>} />
        <Route path="/terms" element={<AppShell><TermsPage /></AppShell>} />
        <Route path="/privacy" element={<AppShell><PrivacyPage /></AppShell>} />
        <Route path="/players/:username" element={<AppShell><PublicProfilePage /></AppShell>} />
        <Route path="/leaderboards" element={<AppShell><LeaderboardsPage /></AppShell>} />
        <Route path="/profile" element={<AppShell><ProfilePage /></AppShell>} />
        {/* Guided flow: start → choose a tournament → where you play → my tournaments. */}
        <Route path="/start" element={<AppShell><StartPage /></AppShell>} />
        <Route path="/join" element={<AppShell><ChooseTournamentPage /></AppShell>} />
        <Route path="/join/:tournamentId" element={<AppShell><ChooseWherePage /></AppShell>} />
        <Route path="/my-tournaments" element={<AppShell><MyTournamentsPage /></AppShell>} />
        <Route path="/tournaments" element={<AppShell><TournamentsPage /></AppShell>} />
        <Route path="/tournaments/:id" element={<AppShell><TournamentDetailPage /></AppShell>} />
        <Route path="/matches/:id/live" element={<AppShell><LiveMatchPage /></AppShell>} />
        {/* Old player pages (slots, bookings, queue) now lead into the guided flow. */}
        {['/play', '/welcome', '/venues', '/venues/:id', '/bookings', '/matches', '/matchmaking'].map((path) => (
          <Route key={path} path={path} element={<Navigate to="/start" replace />} />
        ))}

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

        <Route path="*" element={<AppShell><NotFoundPage /></AppShell>} />
      </Routes>
    </BrowserRouter>
  );
}
