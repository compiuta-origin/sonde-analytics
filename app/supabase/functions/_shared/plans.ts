export const PLAN_LIMITS = {
  free: {
    monthly_credits: 5,
  },
  pro: {
    monthly_credits: 10,
  },
  enterprise: {
    monthly_credits: 1000,
  },
} as const;

export type PlanType = keyof typeof PLAN_LIMITS;
export const MAX_MONTHLY_CREDITS_WITH_REFERRALS = 100;

export function getPlanLimits(plan: string) {
  return PLAN_LIMITS[plan as PlanType] || PLAN_LIMITS.free;
}

export function getReferralBonusContribution(
  plan: string,
  referralBonusCredits: number,
) {
  const baseLimit = getPlanLimits(plan).monthly_credits;
  return Math.min(
    Math.max(0, referralBonusCredits),
    Math.max(0, MAX_MONTHLY_CREDITS_WITH_REFERRALS - baseLimit),
  );
}

export function getEffectiveCreditLimit(
  plan: string,
  referralBonusCredits: number,
) {
  return (
    getPlanLimits(plan).monthly_credits +
    getReferralBonusContribution(plan, referralBonusCredits)
  );
}
