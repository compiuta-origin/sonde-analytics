-- Update default credits for new free users from 2 to 5.
-- ALTER COLUMN SET DEFAULT only affects future INSERTs; existing rows are unchanged.
ALTER TABLE public.profiles ALTER COLUMN credits_balance SET DEFAULT 5;
