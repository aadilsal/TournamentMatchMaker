import { useQuery } from '@tanstack/react-query';
import type { AdminIntegrationsConfig } from '@vr-tournament/shared';
import { apiGet, apiPost } from '@/lib/api';
import { AdminPageHeader, AdminCard, AdminQueryError } from '@/components/admin/AdminUi';
import { Button } from '@/components/ui/button';
import { GridSkeleton } from '@/components/ui/skeleton';
import { useAdminMutation } from '@/hooks/useAdminMutation';

export function AdminIntegrationsPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'integrations'],
    queryFn: () => apiGet<AdminIntegrationsConfig>('/admin/integrations'),
  });

  const testEmail = useAdminMutation({
    mutationFn: () =>
      apiPost<{ sent: boolean; provider: string | null; failures: string[]; to: string }>(
        '/admin/integrations/email/test'
      ),
    successMessage: (r) => (r?.sent ? `Test email sent via ${r.provider} to ${r.to}.` : 'Test email was not delivered — see details.'),
  });
  const result = testEmail.data;

  if (isLoading) return <GridSkeleton count={3} />;
  if (error || !data)
    return <AdminQueryError error={error} resource="integrations" onRetry={() => refetch()} />;

  return (
    <div>
      <AdminPageHeader title="Integrations" description="Meta, email, and Stripe configuration" />

      <div className="grid sm:grid-cols-3 gap-4">
        <AdminCard className="p-5 space-y-2 text-sm">
          <h3 className="font-semibold">Meta VR</h3>
          <p className="text-[var(--color-muted-foreground)]">
            {data?.meta.configured ? `Key: ${data.meta.apiKeyPreview}` : 'Not configured'}
          </p>
        </AdminCard>

        <AdminCard className="p-5 space-y-3 text-sm">
          <h3 className="font-semibold">Email</h3>
          <p className="text-[var(--color-muted-foreground)]">
            Send order: {data.email.providers.length ? data.email.providers.join(' → ') : 'none'}<br />
            From: {data.email.from ?? '—'}<br />
            Enabled: {data.email.enabled ? 'Yes' : 'No'}
          </p>
          {data.email.providers.length === 0 && (
            <p role="alert" className="text-xs text-[var(--color-destructive)]">
              No email provider is configured — emails (including password resets) are not being sent.
            </p>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => testEmail.mutate()}
            disabled={testEmail.isPending || !data?.email.enabled}
          >
            {testEmail.isPending ? 'Sending…' : 'Send test to me'}
          </Button>
          {result && !result.sent && (
            <ul role="alert" className="text-xs text-[var(--color-destructive)] space-y-1 break-words">
              {result.failures.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
          {!data?.email.enabled && (
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Enable email delivery to send a test.
            </p>
          )}
        </AdminCard>

        <AdminCard className="p-5 space-y-2 text-sm">
          <h3 className="font-semibold">Stripe</h3>
          <p className="text-[var(--color-muted-foreground)]">
            {data?.stripe.configured
              ? `Mode: ${data.stripe.mode}`
              : 'Not configured (sample key)'}
          </p>
        </AdminCard>
      </div>
    </div>
  );
}
