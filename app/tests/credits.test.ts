import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getEffectiveCreditLimit,
  getReferralBonusContribution,
} from '../supabase/functions/_shared/plans';

test('free plan referral bonuses cap the effective allowance at 100', () => {
  assert.equal(getReferralBonusContribution('free', 10), 10);
  assert.equal(getEffectiveCreditLimit('free', 10), 15);
  assert.equal(getReferralBonusContribution('free', 95), 95);
  assert.equal(getEffectiveCreditLimit('free', 95), 100);
  assert.equal(getReferralBonusContribution('free', 200), 95);
  assert.equal(getEffectiveCreditLimit('free', 200), 100);
});

test('pro plan referral bonuses cap the effective allowance at 100', () => {
  assert.equal(getReferralBonusContribution('pro', 10), 10);
  assert.equal(getEffectiveCreditLimit('pro', 10), 20);
  assert.equal(getReferralBonusContribution('pro', 90), 90);
  assert.equal(getEffectiveCreditLimit('pro', 90), 100);
  assert.equal(getReferralBonusContribution('pro', 500), 90);
  assert.equal(getEffectiveCreditLimit('pro', 500), 100);
});

test('enterprise plan does not increase from referral bonuses', () => {
  assert.equal(getReferralBonusContribution('enterprise', 1), 0);
  assert.equal(getReferralBonusContribution('enterprise', 500), 0);
  assert.equal(getEffectiveCreditLimit('enterprise', 1), 1000);
  assert.equal(getEffectiveCreditLimit('enterprise', 500), 1000);
});
