import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthTokens } from '@vr-tournament/shared';
import { apiPost, setAccessToken } from '@/lib/api';
import { connectSocket } from '@/hooks/useSocket';
import { isAdminRole } from '@/hooks/useAuthUser';
import { LIVE_QUERY_KEYS } from '@/lib/query-keys';
import { postLoginPath } from '@/lib/return-to';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// Read once, then strip the token from the address bar and history.
function readLink(): { token: string; next: string | null } {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const link = { token: params.get('t') ?? '', next: params.get('next') };
  if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
  return link;
}

/** Email sign-in link: asks before signing in, since mail scanners open links on their own. */
export function AutoLoginPage() {
  const [{ token, next }] = useState(readLink);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const loginPath = `/login${next ? `?returnTo=${encodeURIComponent(next)}` : ''}`;

  const peek = useQuery({
    queryKey: ['login-link', token],
    queryFn: () => apiPost<{ username: string }>('/auth/login-link/peek', { token }),
    enabled: !!token,
    retry: false,
    staleTime: Infinity,
  });

  const redeem = useMutation({
    mutationFn: () => apiPost<AuthTokens>('/auth/login-link', { token }),
    onSuccess: (data) => {
      setAccessToken(data.accessToken);
      queryClient.setQueryData(LIVE_QUERY_KEYS.me, data.user);
      connectSocket();
      navigate(postLoginPath(next, isAdminRole(data.user.role)), { replace: true });
    },
  });

  const expired = !token || peek.isError || redeem.isError;
  const username = peek.data?.username;

  return (
    <div className="max-w-md mx-auto">
      <Card>
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl">
            {expired ? 'This link has expired' : username ? `Welcome back, ${username}` : 'Checking your link…'}
          </CardTitle>
          {!expired && username && <CardDescription>Tap below to continue — no password needed.</CardDescription>}
        </CardHeader>
        <CardContent>
          {expired ? (
            <div role="alert" className="space-y-4 text-center">
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Sign-in links work once and expire after 30 minutes. Sign in with your password instead.
              </p>
              <Link to={loginPath} className={buttonVariants({ size: 'lg', className: 'w-full' })}>
                Sign in
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              <Button size="lg" className="w-full" disabled={!username || redeem.isPending} onClick={() => redeem.mutate()}>
                {redeem.isPending ? 'Signing in…' : username ? `Continue as ${username}` : 'Checking…'}
              </Button>
              <Link to={loginPath} className="block text-center text-sm text-[var(--color-muted-foreground)] underline">
                Not you? Sign in with a different account
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
