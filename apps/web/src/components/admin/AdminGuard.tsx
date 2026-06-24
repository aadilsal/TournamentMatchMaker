import { Navigate, useLocation } from 'react-router-dom';
import { CricketBallLoader } from '@/components/ui/cricket-loader';
import { useAuthUser } from '@/hooks/useAuthUser';

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { isLoggedIn, isAdmin, isLoading } = useAuthUser();

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

  return <>{children}</>;
}
