-- Atomically decrement credits to avoid race conditions across concurrent executions
CREATE OR REPLACE FUNCTION public.decrement_profile_credits_if_available(
  p_profile_id UUID,
  p_amount INT DEFAULT 1
)
RETURNS TABLE(new_balance INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'p_amount must be greater than 0';
  END IF;

  RETURN QUERY
  UPDATE public.profiles
  SET credits_balance = credits_balance - p_amount
  WHERE id = p_profile_id
    AND credits_balance >= p_amount
  RETURNING credits_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.decrement_profile_credits_if_available(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decrement_profile_credits_if_available(UUID, INT) TO service_role;
