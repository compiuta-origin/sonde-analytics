import {
  PLAN_LIMITS as SHARED_PLAN_LIMITS,
  MAX_MONTHLY_CREDITS_WITH_REFERRALS as SHARED_MAX_MONTHLY_CREDITS_WITH_REFERRALS,
  getEffectiveCreditLimit as getSharedEffectiveCreditLimit,
  getPlanLimits as getSharedPlanLimits,
  getReferralBonusContribution as getSharedReferralBonusContribution,
} from '../supabase/functions/_shared/plans';

export const PLAN_LIMITS = SHARED_PLAN_LIMITS;
export type PlanType = keyof typeof PLAN_LIMITS;
export const MAX_MONTHLY_CREDITS_WITH_REFERRALS =
  SHARED_MAX_MONTHLY_CREDITS_WITH_REFERRALS;

export function getPlanLimits(plan: string) {
  return getSharedPlanLimits(plan);
}

export function getReferralBonusContribution(
  plan: string,
  referralBonusCredits: number,
) {
  return getSharedReferralBonusContribution(plan, referralBonusCredits);
}

export function getEffectiveCreditLimit(
  plan: string,
  referralBonusCredits: number,
) {
  return getSharedEffectiveCreditLimit(plan, referralBonusCredits);
}
