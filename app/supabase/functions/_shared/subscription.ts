export interface SubscriptionRow {
  id?: string;
  stripe_customer_id?: string | null;
  plan?: string | null;
  status?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

export interface SubscriptionSelectionOptions {
  preferredStatuses: string[];
  allowFallbackCustomerId: boolean;
  allowFallbackAnyRow: boolean;
}

function subscriptionSortValue(subscription: SubscriptionRow): string {
  return subscription.updated_at ?? subscription.created_at ?? '';
}

/**
 * Pick the best subscription row for a given purpose.
 *
 * @param subscriptions  All rows for the user, in any order.
 * @param options  Explicit selection policy for the caller.
 */
export function pickSubscriptionRow<T extends SubscriptionRow>(
  subscriptions: T[] | null | undefined,
  options: SubscriptionSelectionOptions,
): T | null {
  if (!subscriptions || subscriptions.length === 0) return null;

  const ordered = [...subscriptions].sort((a, b) =>
    subscriptionSortValue(b).localeCompare(subscriptionSortValue(a)),
  );

  const preferredMatch = ordered.find(
    (subscription) =>
      subscription.stripe_customer_id &&
      options.preferredStatuses.includes(subscription.status ?? ''),
  );

  if (preferredMatch) {
    return preferredMatch;
  }

  if (options.allowFallbackCustomerId) {
    const fallbackCustomerMatch = ordered.find(
      (subscription) =>
        subscription.stripe_customer_id,
    );

    if (fallbackCustomerMatch) {
      return fallbackCustomerMatch;
    }
  }

  if (options.allowFallbackAnyRow) {
    return ordered[0] ?? null;
  }

  return null;
}

export const CHECKOUT_SUBSCRIPTION_SELECTION_OPTIONS: SubscriptionSelectionOptions = {
  preferredStatuses: ['active', 'trialing'],
  allowFallbackCustomerId: true,
  allowFallbackAnyRow: true,
};

export const PORTAL_SUBSCRIPTION_SELECTION_OPTIONS: SubscriptionSelectionOptions = {
  preferredStatuses: ['active', 'trialing', 'past_due', 'canceled'],
  allowFallbackCustomerId: true,
  allowFallbackAnyRow: false,
};
