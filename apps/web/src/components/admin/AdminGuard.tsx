import { Link, Navigate, useLocation } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { CricketBallLoader } from '@/components/ui/cricket-loader';
import { Button } from '@/components/ui/button';
import { useAuthUser } from '@/hooks/useAuthUser';
import { canAccessAdminPath } from '@/lib/admin-routes';

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { isLoggedIn, isAdmin, isLoading, user } = useAuthUser();

  if (!isLoggedIn) {
    return <Navigate to={`/login?returnTo=${encodeURIComponent(location.pathname)}`} replace />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <CricketBallLoader size="lg" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/tournaments" replace />;
  }

  // An admin of the wrong kind gets an explicit "not allowed" screen rather than
  // an empty table that reads as "no data".
  if (!canAccessAdminPath(location.pathname, user?.role)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-destructive)]/15 text-[var(--color-destructive)]">
            <ShieldOff className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">You don&apos;t have access to this page</h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted-foreground)]">
            Your account is a <strong>{user?.role?.replace(/_/g, ' ')}</strong>, which doesn&apos;t cover
            this section of the admin panel. Ask a superadmin if you need access.
          </p>
          <Link to="/admin" className="mt-5 inline-block">
            <Button variant="outline" size="sm">
              Back to dashboard
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
