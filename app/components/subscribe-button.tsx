'use client';

import { useToast } from '@/components/providers/toast-provider';
import { Button } from '@/components/ui/button';
import { createBrowserClient } from '@/lib/supabase';
import { Zap } from 'lucide-react';
import { useState } from 'react';

type BillingInterval = 'monthly' | 'yearly';

interface SubscribeButtonProps {
  interval?: BillingInterval;
  currency?: string;
  priceId?: string;
  planName?: string;
  className?: string;
  children?: React.ReactNode;
}

export default function SubscribeButton({
  interval = 'monthly',
  currency = 'eur',
  priceId,
  planName = 'Pro',
  className,
  children,
}: SubscribeButtonProps) {
  const [loading, setLoading] = useState(false);
  const supabase = createBrowserClient();
  const { error: showError } = useToast();

  const getLookupKey = (interval: BillingInterval) => {
    return interval === 'monthly' ? 'sonde_pro_monthly' : 'sonde_pro_yearly';
  };

  const handleCheckout = async () => {
    setLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        window.location.href = '/login?next=/upgrade';
        return;
      }

      const lookupKey = getLookupKey(interval);

      const { data, error } = await supabase.functions.invoke(
        'create-checkout-session',
        {
          body: {
            lookupKey: lookupKey,
            currency: currency,
          },
        }
      );

      if (error) {
        throw error;
      }

      // Redirect to Stripe Checkout using the session URL
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No session URL returned from the server.');
      }
    } catch (error: any) {
      console.error('Error:', error);
      showError(`Something went wrong: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handleCheckout}
      disabled={loading}
      className={className}
      variant="primary"
      size="lg"
    >
      {loading
        ? 'Redirecting...'
        : children ||
        (planName === 'Enterprise' ? (
          <>
            <Zap size={16} className="mr-2" /> Contact Sales
          </>
        ) : (
          'Start 30-Day Trial'
        ))}
    </Button>
  );
}
