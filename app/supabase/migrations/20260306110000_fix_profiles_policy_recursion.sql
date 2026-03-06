-- Fix infinite recursion in profiles UPDATE policy.
--
-- Users should be able to update any field on their own profile except
-- credits_balance (to prevent self-granting credits). The WITH CHECK enforces
-- this by asserting the new credits_balance equals the current one.
--
-- The original policy queried profiles directly inside the WITH CHECK clause,
-- which triggered RLS re-evaluation on the same table and caused infinite
-- recursion on any client-side profile update.
--
-- The fix wraps that lookup in a SECURITY DEFINER function so it bypasses RLS.
-- The function takes no arguments and hardcodes auth.uid(), so it can only ever
-- read the calling user's own credits_balance — no security is bypassed.

CREATE OR REPLACE FUNCTION public.get_own_credits_balance()
  RETURNS numeric
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT credits_balance FROM profiles WHERE id = auth.uid();
$$;

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING ((SELECT auth.uid()) = id)
  WITH CHECK (
    credits_balance = public.get_own_credits_balance()
  );
