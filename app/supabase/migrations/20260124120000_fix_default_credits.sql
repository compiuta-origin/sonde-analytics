-- Fix default credits balance for new users
ALTER TABLE public.profiles ALTER COLUMN credits_balance SET DEFAULT 2;

-- Update existing users who have 0 balance and no active paid subscription
UPDATE public.profiles
SET credits_balance = 2
WHERE credits_balance = 0
AND NOT EXISTS (
  SELECT 1 FROM public.subscriptions
  WHERE user_id = profiles.id
  AND status IN ('active', 'trialing')
  AND plan IN ('pro', 'enterprise')
);
