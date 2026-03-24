import { createBrowserClient } from './supabase';

export interface SubscriptionRecord {
  id?: string;
  user_id?: string;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  plan?: string | null;
  status?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

function subscriptionSortValue(subscription: SubscriptionRecord) {
  return (
    subscription.current_period_start ??
    subscription.current_period_end ??
    subscription.updated_at ??
    subscription.created_at ??
    ''
  );
}

export function pickCurrentSubscription(
  subscriptions: SubscriptionRecord[] | null | undefined,
) {
  if (!subscriptions || subscriptions.length === 0) return null;

  const ordered = [...subscriptions].sort((a, b) =>
    subscriptionSortValue(b).localeCompare(subscriptionSortValue(a)),
  );

  const activePaid = ordered.find(
    (subscription) =>
      ACTIVE_STATUSES.has(subscription.status ?? '') &&
      ['pro', 'enterprise'].includes(subscription.plan ?? ''),
  );

  if (activePaid) return activePaid;

  return ordered[0] ?? null;
}

export function getResolvedPlan(subscription: SubscriptionRecord | null) {
  if (
    subscription &&
    ACTIVE_STATUSES.has(subscription.status ?? '') &&
    ['pro', 'enterprise'].includes(subscription.plan ?? '')
  ) {
    return subscription.plan as 'pro' | 'enterprise';
  }

  return 'free' as const;
}

export async function getCurrentSubscription() {
  const supabase = createBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error loading subscriptions:', error);
    return null;
  }

  return pickCurrentSubscription(data);
}

export function hasProAccess(subscription: SubscriptionRecord | null): boolean {
  if (!subscription) return false;

  if (subscription.plan === 'enterprise') return true;

  if (subscription.plan === 'pro') {
    return ACTIVE_STATUSES.has(subscription.status ?? '');
  }

  return false;
}
