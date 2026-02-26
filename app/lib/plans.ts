import { PLAN_LIMITS as SHARED_PLAN_LIMITS, getPlanLimits as getSharedPlanLimits } from '../supabase/functions/_shared/plans';

export const PLAN_LIMITS = SHARED_PLAN_LIMITS;
export type PlanType = keyof typeof PLAN_LIMITS;

export function getPlanLimits(plan: string) {
  return getSharedPlanLimits(plan);
}