import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { getAccessToken } from '@/lib/api';
import { useAuthUser } from '@/hooks/useAuthUser';
import { postLoginPath } from '@/lib/return-to';
import { CricketBallLoader } from '@/components/ui/cricket-loader';

/** Sends an already signed-in visitor on from /login or /register instead of showing the form. */
export function GuestOnly({ children }: { children: React.ReactNode }) {
  // Decided once on mount, so signing in on this page doesn't race the page's own redirect.
  const [authedOnArrival] = useState(() => !!getAccessToken());
  const [searchParams] = useSearchParams();
  const { isAdmin, isLoading, isError } = useAuthUser();

  if (!authedOnArrival || isError) return <>{children}</>;
  if (isLoading) {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center">
        <CricketBallLoader size="lg" />
      </div>
    );
  }
  return <Navigate to={postLoginPath(searchParams.get('returnTo'), isAdmin)} replace />;
}
