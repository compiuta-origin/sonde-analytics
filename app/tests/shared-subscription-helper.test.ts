import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHECKOUT_SUBSCRIPTION_SELECTION_OPTIONS,
  PORTAL_SUBSCRIPTION_SELECTION_OPTIONS,
  pickSubscriptionRow,
  type SubscriptionRow,
} from '../supabase/functions/_shared/subscription';

type CheckoutSubscriptionRow = SubscriptionRow & {
  id: string;
};

test('pickSubscriptionRow preserves the full caller row shape', () => {
  const subscriptions: CheckoutSubscriptionRow[] = [
    {
      id: 'stale-free-row',
      stripe_customer_id: null,
      plan: 'free',
      status: 'inactive',
      updated_at: '2026-03-10T00:00:00.000Z',
    },
    {
      id: 'active-paid-row',
      stripe_customer_id: 'cus_123',
      plan: 'pro',
      status: 'active',
      updated_at: '2026-03-01T00:00:00.000Z',
    },
  ];

  const subscription = pickSubscriptionRow(
    subscriptions,
    CHECKOUT_SUBSCRIPTION_SELECTION_OPTIONS,
  );

  assert.equal(subscription?.id, 'active-paid-row');
  assert.equal(subscription?.stripe_customer_id, 'cus_123');
});

test('checkout selection falls back to any existing customer row when no preferred status exists', () => {
  const subscription = pickSubscriptionRow(
    [
      {
        id: 'incomplete-customer-row',
        stripe_customer_id: 'cus_fallback',
        status: 'incomplete',
        updated_at: '2026-03-10T00:00:00.000Z',
      },
      {
        id: 'free-row-without-customer',
        stripe_customer_id: null,
        status: 'inactive',
        updated_at: '2026-03-11T00:00:00.000Z',
      },
    ],
    CHECKOUT_SUBSCRIPTION_SELECTION_OPTIONS,
  );

  assert.equal(subscription?.id, 'incomplete-customer-row');
});

test('checkout selection can still fall back to the latest row when no customer exists yet', () => {
  const subscription = pickSubscriptionRow(
    [
      {
        id: 'latest-free-row',
        stripe_customer_id: null,
        status: 'inactive',
        updated_at: '2026-03-11T00:00:00.000Z',
      },
      {
        id: 'older-free-row',
        stripe_customer_id: null,
        status: 'inactive',
        updated_at: '2026-03-01T00:00:00.000Z',
      },
    ],
    CHECKOUT_SUBSCRIPTION_SELECTION_OPTIONS,
  );

  assert.equal(subscription?.id, 'latest-free-row');
});

test('portal selection returns null when no customer exists on any row', () => {
  const subscription = pickSubscriptionRow(
    [
      {
        id: 'free-row',
        stripe_customer_id: null,
        status: 'inactive',
        updated_at: '2026-03-11T00:00:00.000Z',
      },
    ],
    PORTAL_SUBSCRIPTION_SELECTION_OPTIONS,
  );

  assert.equal(subscription, null);
});
