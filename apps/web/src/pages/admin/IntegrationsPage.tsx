import { useMutation, useQuery } from '@tanstack/react-query';
import type { AdminIntegrationsConfig } from '@vr-tournament/shared';
import { apiGet, apiPost } from '@/lib/api';
import { AdminPageHeader, AdminCard } from '@/components/admin/AdminUi';
import { Button } from '@/components/ui/button';
import { GridSkeleton } from '@/components/ui/skeleton';

export function AdminIntegrationsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'integrations'],
    queryFn: () => apiGet<AdminIntegrationsConfig>('/admin/integrations'),
  });

  const testEmail = useMutation({
    mutationFn: () => apiPost('/admin/integrations/email/test'),
  });

  if (isLoading) return <GridSkeleton count={3} />;

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
            Provider: {data?.email.provider}<br />
            From: {data?.email.from}<br />
            Enabled: {data?.email.enabled ? 'Yes' : 'No'}
          </p>
          <Button size="sm" variant="outline" onClick={() => testEmail.mutate()} disabled={testEmail.isPending}>
            Send test to me
          </Button>
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
