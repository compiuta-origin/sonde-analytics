export const PLAN_LIMITS = {
  free: {
    monthly_credits: 2,
  },
  pro: {
    monthly_credits: 10,
  },
  enterprise: {
    monthly_credits: 1000,
  },
} as const;

export type PlanType = keyof typeof PLAN_LIMITS;

export function getPlanLimits(plan: string) {
  return PLAN_LIMITS[plan as PlanType] || PLAN_LIMITS.free;
}
