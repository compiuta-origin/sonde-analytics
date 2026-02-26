-- Restrict profile UPDATE policy to prevent self-granting credits
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING ((select auth.uid()) = id)
  WITH CHECK (
    credits_balance = (SELECT credits_balance FROM profiles WHERE id = (select auth.uid()))
  );
