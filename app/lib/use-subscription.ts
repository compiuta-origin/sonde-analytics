'use client';

import { useSupabase } from '@/components/auth-provider';
import { useEffect, useState } from 'react';

export type SubscriptionPlan = 'free' | 'pro' | 'enterprise';

interface Subscription {
  plan: SubscriptionPlan;
  status: string;
  isLoading: boolean;
}

export function useSubscription(): Subscription {
  const { supabase, user } = useSupabase();
  const [plan, setPlan] = useState<SubscriptionPlan>('free');
  const [status, setStatus] = useState<string>('inactive');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadSubscription() {
      if (!user) {
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('subscriptions')
          .select('plan, status')
          .eq('user_id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') {
           // Ignore 'Row not found' error, means Free tier
           console.error('Error fetching subscription:', error);
        }

        if (data && ['active', 'trialing'].includes(data.status)) {
          setPlan(data.plan as SubscriptionPlan);
          setStatus(data.status);
        } else {
          setPlan('free');
          setStatus('inactive');
        }
      } catch (err) {
        console.error('Unexpected error loading subscription:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadSubscription();
  }, [user, supabase]);

  return { plan, status, isLoading };
}
