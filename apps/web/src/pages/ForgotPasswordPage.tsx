import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { MailCheck } from 'lucide-react';
import { apiPost } from '@/lib/api';
import { getUserErrorMessage } from '@/lib/user-messages';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const request = useMutation({
    mutationFn: (value: string) => apiPost('/auth/forgot-password', { email: value }),
    onError: (err) => setError(getUserErrorMessage(err)),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const trimmed = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) {
      setError('Please enter the email address you signed up with.');
      return;
    }
    request.mutate(trimmed);
  };

  return (
    <div className="max-w-md mx-auto">
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Reset your password</CardTitle>
          <CardDescription>
            Enter your account email and we&rsquo;ll send you a link to choose a new password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {request.isSuccess ? (
            <div role="status" className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 p-4">
                <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-primary)]" />
                <p className="text-sm leading-relaxed">
                  If an account exists for <span className="font-semibold">{email.trim()}</span>, a reset
                  link is on its way. It can take a few minutes — check your spam folder too.
                </p>
              </div>
              <Button variant="outline" className="w-full" onClick={() => request.reset()}>
                Use a different email
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="forgot-email">Email address</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError('');
                  }}
                  aria-invalid={!!error}
                  aria-describedby={error ? 'forgot-error' : undefined}
                  required
                />
              </div>
              {error && (
                <p
                  id="forgot-error"
                  role="alert"
                  className="rounded-md border border-[var(--color-destructive)]/30 bg-[var(--color-destructive)]/10 px-3 py-2 text-sm text-[var(--color-destructive)]"
                >
                  {error}
                </p>
              )}
              <Button type="submit" size="lg" className="w-full" disabled={request.isPending}>
                {request.isPending ? 'Sending…' : 'Send reset link'}
              </Button>
            </form>
          )}
          <p className="mt-6 text-center text-sm text-[var(--color-muted-foreground)]">
            Remembered it?{' '}
            <Link to="/login" className="font-medium text-[var(--color-primary)] hover:underline">
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
