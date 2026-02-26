-- Migration to remove profiles.tier and cleanup
-- 1. Drop trigger if exists
DROP TRIGGER IF EXISTS sync_subscription_plan ON public.subscriptions;

-- 2. Drop function
DROP FUNCTION IF EXISTS sync_subscription_plan_to_profile;

-- 3. Drop column from profiles
ALTER TABLE public.profiles DROP COLUMN IF EXISTS tier;

-- 4. Drop tiers table
DROP TABLE IF EXISTS public.tiers;
