'use client';

import { useSupabase } from '@/components/auth-provider';
import { getResolvedPlan, pickCurrentSubscription } from '@/lib/subscription';
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
          .select('plan, status, current_period_start, current_period_end, updated_at, created_at')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(10);

        if (error) {
           console.error('Error fetching subscription:', error);
        }

        const subscription = pickCurrentSubscription(data);

        if (subscription) {
          setPlan(getResolvedPlan(subscription) as SubscriptionPlan);
          setStatus(
            ['active', 'trialing'].includes(subscription.status ?? '')
              ? (subscription.status as string)
              : 'inactive',
          );
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
