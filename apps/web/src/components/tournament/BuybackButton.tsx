import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import type { BuybackCheckoutSession, Tournament } from '@vr-tournament/shared';
import { apiPost } from '@/lib/api';
import { getUserErrorMessage } from '@/lib/user-messages';
import { LIVE_QUERY_KEYS } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import { Heart } from 'lucide-react';

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 'pk_test_sample_change_me';
const stripeConfigured =
  !!publishableKey && !publishableKey.includes('sample') && publishableKey.startsWith('pk_');
const stripePromise = stripeConfigured ? loadStripe(publishableKey) : null;

interface BuybackButtonProps {
  tournamentId: string;
  tournament: Tournament;
  matchId?: string;
  onSuccess?: () => void;
}

function BuybackPaymentForm({
  onSuccess,
  onCancel,
}: {
  onSuccess?: () => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(false);

  const handlePay = async () => {
    if (!stripe || !elements) return;
    setPaying(true);
    setError('');
    const { error: submitError } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });
    setPaying(false);
    if (submitError) {
      setError(submitError.message ?? 'Payment failed');
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['tournament-participant'] });
    queryClient.invalidateQueries({ queryKey: LIVE_QUERY_KEYS.matchmakingStatus });
    queryClient.invalidateQueries({ queryKey: LIVE_QUERY_KEYS.matches });
    queryClient.invalidateQueries({ queryKey: LIVE_QUERY_KEYS.buybackOptions });
    onSuccess?.();
  };

  return (
    <div className="space-y-3 rounded-lg border border-[var(--color-border)] p-4">
      <PaymentElement />
      {error && <p className="text-xs text-[var(--color-destructive)]">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={handlePay} disabled={!stripe || paying} className="flex-1 gap-2">
          <Heart className="h-4 w-4" />
          {paying ? 'Processing…' : 'Pay & buy back'}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={paying}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function BuybackButton({ tournamentId, tournament, matchId, onSuccess }: BuybackButtonProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  const checkout = useMutation({
    mutationFn: () =>
      apiPost<BuybackCheckoutSession>(`/tournaments/${tournamentId}/buyback/checkout`, matchId ? { matchId } : {}),
    onSuccess: (data) => setClientSecret(data.clientSecret),
  });

  const price = (tournament.buybackPriceCents / 100).toFixed(2);

  if (!stripeConfigured || !stripePromise) {
    return (
      <p className="text-xs text-[var(--color-muted-foreground)]">
        Buyback payments are temporarily unavailable. Stripe is not configured.
      </p>
    );
  }

  if (clientSecret) {
    return (
      <Elements stripe={stripePromise} options={{ clientSecret }}>
        <BuybackPaymentForm onSuccess={onSuccess} onCancel={() => setClientSecret(null)} />
      </Elements>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        onClick={() => checkout.mutate()}
        disabled={checkout.isPending}
        className="gap-2"
        variant="outline"
      >
        <Heart className="h-4 w-4 text-[var(--color-primary)]" />
        {checkout.isPending ? 'Preparing payment…' : `Buy back a life — $${price}`}
      </Button>
      {checkout.isError && (
        <p className="text-xs text-[var(--color-destructive)]">{getUserErrorMessage(checkout.error)}</p>
      )}
    </div>
  );
}
