import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getResolvedPlan,
  pickCurrentSubscription,
} from '../lib/subscription';

test('pickCurrentSubscription prefers active paid subscriptions over stale rows', () => {
  const subscription = pickCurrentSubscription([
    {
      plan: 'free',
      status: 'canceled',
      updated_at: '2026-03-01T10:00:00.000Z',
    },
    {
      plan: 'pro',
      status: 'active',
      updated_at: '2026-02-01T10:00:00.000Z',
    },
  ]);

  assert.equal(subscription?.plan, 'pro');
  assert.equal(subscription?.status, 'active');
  assert.equal(getResolvedPlan(subscription ?? null), 'pro');
});

test('getResolvedPlan falls back to free when there is no active paid subscription', () => {
  const subscription = pickCurrentSubscription([
    {
      plan: 'enterprise',
      status: 'canceled',
      updated_at: '2026-03-01T10:00:00.000Z',
    },
  ]);

  assert.equal(getResolvedPlan(subscription ?? null), 'free');
});

test('getResolvedPlan returns the paid plan for a trialing subscription', () => {
  const subscription = pickCurrentSubscription([
    {
      plan: 'pro',
      status: 'trialing',
      updated_at: '2026-03-01T10:00:00.000Z',
    },
  ]);

  assert.equal(getResolvedPlan(subscription ?? null), 'pro');
});

test('getResolvedPlan falls back to free for a past_due subscription', () => {
  const subscription = pickCurrentSubscription([
    {
      plan: 'pro',
      status: 'past_due',
      updated_at: '2026-03-01T10:00:00.000Z',
    },
  ]);

  assert.equal(getResolvedPlan(subscription ?? null), 'free');
});

test('pickCurrentSubscription prefers active paid sub over newer past_due row', () => {
  const subscription = pickCurrentSubscription([
    {
      plan: 'pro',
      status: 'past_due',
      updated_at: '2026-03-10T00:00:00.000Z',
    },
    {
      plan: 'pro',
      status: 'active',
      updated_at: '2026-02-01T00:00:00.000Z',
    },
  ]);

  assert.equal(subscription?.status, 'active');
  assert.equal(getResolvedPlan(subscription ?? null), 'pro');
});
