ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code TEXT,
  ADD COLUMN IF NOT EXISTS signup_referral_code TEXT,
  ADD COLUMN IF NOT EXISTS signup_referral_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS referred_by_user_id UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS referral_bonus_credits INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_credit_reset_key TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_signup_referral_status_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_signup_referral_status_check
      CHECK (signup_referral_status IN ('none', 'pending', 'applied', 'invalid', 'self'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.referral_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.referral_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS referral_events_referrer_user_id_idx
  ON public.referral_events(referrer_user_id);

CREATE OR REPLACE FUNCTION public.generate_unique_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
BEGIN
  LOOP
    v_code := UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', '') FROM 1 FOR 8));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE referral_code = v_code
    );
  END LOOP;

  RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_plan_monthly_credits(p_plan TEXT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_plan
    WHEN 'enterprise' THEN 1000
    WHEN 'pro' THEN 10
    ELSE 5
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_effective_credit_limit(
  p_plan TEXT,
  p_referral_bonus_credits INT
)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.get_plan_monthly_credits(p_plan) + LEAST(
    GREATEST(COALESCE(p_referral_bonus_credits, 0), 0),
    GREATEST(0, 100 - public.get_plan_monthly_credits(p_plan))
  );
$$;

CREATE OR REPLACE FUNCTION public.get_current_plan_for_profile(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT s.plan
    FROM public.subscriptions s
    WHERE s.user_id = p_user_id
      AND s.plan IN ('pro', 'enterprise')
      AND s.status IN ('active', 'trialing')
    ORDER BY s.updated_at DESC NULLS LAST, s.created_at DESC NULLS LAST
    LIMIT 1
  ), 'free');
$$;

CREATE OR REPLACE FUNCTION public.get_monthly_anniversary_anchor(
  p_created_at TIMESTAMPTZ,
  p_reference TIMESTAMPTZ DEFAULT now()
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_months_since INT;
  v_anchor TIMESTAMPTZ;
BEGIN
  IF p_reference <= p_created_at THEN
    RETURN p_created_at;
  END IF;

  v_months_since :=
    (DATE_PART('year', age(p_reference, p_created_at))::INT * 12) +
    DATE_PART('month', age(p_reference, p_created_at))::INT;

  v_anchor := p_created_at + make_interval(months => v_months_since);

  IF v_anchor > p_reference THEN
    v_anchor := p_created_at + make_interval(months => GREATEST(v_months_since - 1, 0));
  END IF;

  WHILE v_anchor + INTERVAL '1 month' <= p_reference LOOP
    v_anchor := v_anchor + INTERVAL '1 month';
  END LOOP;

  RETURN v_anchor;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_free_credit_reset_key(
  p_created_at TIMESTAMPTZ,
  p_reference TIMESTAMPTZ DEFAULT now()
)
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT 'free:' || FLOOR(EXTRACT(EPOCH FROM public.get_monthly_anniversary_anchor(
    p_created_at,
    p_reference
  )) * 1000)::BIGINT::TEXT;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_signup_referral_code TEXT;
BEGIN
  v_signup_referral_code := NULLIF(
    UPPER(REGEXP_REPLACE(
      BTRIM(COALESCE(new.raw_user_meta_data ->> 'referral_code', '')),
      '[^A-Z0-9]',
      '',
      'g'
    )),
    ''
  );

  INSERT INTO public.profiles (
    id,
    email,
    referral_code,
    signup_referral_code,
    signup_referral_status
  )
  VALUES (
    new.id,
    new.email,
    public.generate_unique_referral_code(),
    v_signup_referral_code,
    CASE
      WHEN v_signup_referral_code IS NULL THEN 'none'
      ELSE 'pending'
    END
  );

  RETURN new;
END;
$$;

UPDATE public.profiles
SET
  referral_code = COALESCE(NULLIF(referral_code, ''), public.generate_unique_referral_code()),
  signup_referral_code = NULLIF(
    UPPER(REGEXP_REPLACE(BTRIM(COALESCE(signup_referral_code, '')), '[^A-Z0-9]', '', 'g')),
    ''
  ),
  signup_referral_status = 'none',
  referral_bonus_credits = COALESCE(referral_bonus_credits, 0)
WHERE referral_code IS NULL
   OR referral_code = ''
   OR signup_referral_status IS DISTINCT FROM 'none'
   OR referral_bonus_credits IS NULL
   OR signup_referral_code IS DISTINCT FROM NULLIF(
     UPPER(REGEXP_REPLACE(BTRIM(COALESCE(signup_referral_code, '')), '[^A-Z0-9]', '', 'g')),
     ''
   );

ALTER TABLE public.profiles
  ALTER COLUMN referral_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_idx
  ON public.profiles(referral_code);

CREATE OR REPLACE FUNCTION public.finalize_referral_signup()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile public.profiles%ROWTYPE;
  v_referrer_id UUID;
  v_code TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO v_profile
  FROM public.profiles
  WHERE id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'awarded', false,
      'reason', 'profile_not_found',
      'referral_code', NULL,
      'referrer_user_id', NULL
    );
  END IF;

  IF v_profile.signup_referral_status <> 'pending' THEN
    RETURN jsonb_build_object(
      'awarded', false,
      'reason', v_profile.signup_referral_status,
      'referral_code', v_profile.signup_referral_code,
      'referrer_user_id', v_profile.referred_by_user_id
    );
  END IF;

  v_code := NULLIF(
    UPPER(REGEXP_REPLACE(BTRIM(COALESCE(v_profile.signup_referral_code, '')), '[^A-Z0-9]', '', 'g')),
    ''
  );

  IF v_code IS NULL THEN
    UPDATE public.profiles
    SET
      signup_referral_code = NULL,
      signup_referral_status = 'none'
    WHERE id = v_user_id;

    RETURN jsonb_build_object(
      'awarded', false,
      'reason', 'none',
      'referral_code', NULL,
      'referrer_user_id', NULL
    );
  END IF;

  SELECT id
  INTO v_referrer_id
  FROM public.profiles
  WHERE referral_code = v_code;

  IF v_referrer_id IS NULL THEN
    UPDATE public.profiles
    SET
      signup_referral_code = v_code,
      signup_referral_status = 'invalid'
    WHERE id = v_user_id;

    RETURN jsonb_build_object(
      'awarded', false,
      'reason', 'invalid',
      'referral_code', v_code,
      'referrer_user_id', NULL
    );
  END IF;

  IF v_referrer_id = v_user_id THEN
    UPDATE public.profiles
    SET
      signup_referral_code = v_code,
      signup_referral_status = 'self'
    WHERE id = v_user_id;

    RETURN jsonb_build_object(
      'awarded', false,
      'reason', 'self',
      'referral_code', v_code,
      'referrer_user_id', v_referrer_id
    );
  END IF;

  BEGIN
    INSERT INTO public.referral_events (
      referrer_user_id,
      referred_user_id,
      referral_code
    )
    VALUES (
      v_referrer_id,
      v_user_id,
      v_code
    );
  EXCEPTION
    WHEN unique_violation THEN
      UPDATE public.profiles
      SET
        signup_referral_code = v_code,
        signup_referral_status = 'applied',
        referred_by_user_id = COALESCE(referred_by_user_id, v_referrer_id)
      WHERE id = v_user_id;

      RETURN jsonb_build_object(
        'awarded', false,
        'reason', 'applied',
        'referral_code', v_code,
        'referrer_user_id', v_referrer_id
      );
  END;

  UPDATE public.profiles
  SET
    signup_referral_code = v_code,
    signup_referral_status = 'applied',
    referred_by_user_id = v_referrer_id,
    referral_bonus_credits = referral_bonus_credits + 1,
    credits_balance = LEAST(
      credits_balance + 1,
      public.get_effective_credit_limit(
        public.get_current_plan_for_profile(id),
        referral_bonus_credits + 1
      )
    )
  WHERE id = v_user_id;

  UPDATE public.profiles
  SET
    referral_bonus_credits = referral_bonus_credits + 1,
    credits_balance = LEAST(
      credits_balance + 1,
      public.get_effective_credit_limit(
        public.get_current_plan_for_profile(id),
        referral_bonus_credits + 1
      )
    )
  WHERE id = v_referrer_id;

  RETURN jsonb_build_object(
    'awarded', true,
    'reason', 'applied',
    'referral_code', v_code,
    'referrer_user_id', v_referrer_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_user_credits_for_period(
  p_user_id UUID,
  p_plan TEXT,
  p_reset_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_effective_limit INT;
BEGIN
  SELECT *
  INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile % not found', p_user_id;
  END IF;

  v_effective_limit := public.get_effective_credit_limit(
    p_plan,
    v_profile.referral_bonus_credits
  );

  IF v_profile.last_credit_reset_key IS NOT DISTINCT FROM p_reset_key THEN
    RETURN jsonb_build_object(
      'reset_applied', false,
      'effective_limit', v_effective_limit,
      'credits_balance', v_profile.credits_balance,
      'reset_key', p_reset_key
    );
  END IF;

  UPDATE public.profiles
  SET
    credits_balance = v_effective_limit,
    last_credit_reset_key = p_reset_key
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'reset_applied', true,
    'effective_limit', v_effective_limit,
    'credits_balance', v_effective_limit,
    'reset_key', p_reset_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_free_profiles_due_for_credit_reset()
RETURNS TABLE (
  user_id UUID,
  reset_key TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id AS user_id,
    public.get_free_credit_reset_key(p.created_at, now()) AS reset_key
  FROM public.profiles p
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.user_id = p.id
      AND s.plan IN ('pro', 'enterprise')
      AND s.status IN ('active', 'trialing')
  )
    AND p.last_credit_reset_key IS DISTINCT FROM public.get_free_credit_reset_key(p.created_at, now());
$$;

CREATE OR REPLACE FUNCTION public.get_own_profile_protected_fields()
RETURNS TABLE (
  credits_balance INT,
  referral_code TEXT,
  signup_referral_code TEXT,
  signup_referral_status TEXT,
  referred_by_user_id UUID,
  referral_bonus_credits INT,
  last_credit_reset_key TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.credits_balance,
    p.referral_code,
    p.signup_referral_code,
    p.signup_referral_status,
    p.referred_by_user_id,
    p.referral_bonus_credits,
    p.last_credit_reset_key
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING ((SELECT auth.uid()) = id)
  WITH CHECK (
    credits_balance IS NOT DISTINCT FROM (
      SELECT protected.credits_balance
      FROM public.get_own_profile_protected_fields() AS protected
    )
    AND referral_code IS NOT DISTINCT FROM (
      SELECT protected.referral_code
      FROM public.get_own_profile_protected_fields() AS protected
    )
    AND signup_referral_code IS NOT DISTINCT FROM (
      SELECT protected.signup_referral_code
      FROM public.get_own_profile_protected_fields() AS protected
    )
    AND signup_referral_status IS NOT DISTINCT FROM (
      SELECT protected.signup_referral_status
      FROM public.get_own_profile_protected_fields() AS protected
    )
    AND referred_by_user_id IS NOT DISTINCT FROM (
      SELECT protected.referred_by_user_id
      FROM public.get_own_profile_protected_fields() AS protected
    )
    AND referral_bonus_credits IS NOT DISTINCT FROM (
      SELECT protected.referral_bonus_credits
      FROM public.get_own_profile_protected_fields() AS protected
    )
    AND last_credit_reset_key IS NOT DISTINCT FROM (
      SELECT protected.last_credit_reset_key
      FROM public.get_own_profile_protected_fields() AS protected
    )
  );

WITH paid_subscriptions AS (
  SELECT DISTINCT ON (s.user_id)
    s.user_id,
    s.stripe_subscription_id,
    s.current_period_start
  FROM public.subscriptions s
  WHERE s.plan IN ('pro', 'enterprise')
    AND s.status IN ('active', 'trialing')
    AND s.current_period_start IS NOT NULL
  ORDER BY s.user_id, s.updated_at DESC NULLS LAST, s.created_at DESC NULLS LAST
)
UPDATE public.profiles p
SET last_credit_reset_key = 'stripe:'
  || COALESCE(paid.stripe_subscription_id, p.id::TEXT)
  || ':'
  || FLOOR(EXTRACT(EPOCH FROM paid.current_period_start) * 1000)::BIGINT::TEXT
FROM paid_subscriptions paid
WHERE p.id = paid.user_id
  AND p.last_credit_reset_key IS NULL;

UPDATE public.profiles p
SET last_credit_reset_key = public.get_free_credit_reset_key(p.created_at, now())
WHERE p.last_credit_reset_key IS NULL;

REVOKE ALL ON FUNCTION public.finalize_referral_signup() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_referral_signup() TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_referral_signup() TO service_role;

REVOKE ALL ON FUNCTION public.reset_user_credits_for_period(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_user_credits_for_period(UUID, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.get_current_plan_for_profile(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_free_profiles_due_for_credit_reset() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_own_profile_protected_fields() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_free_profiles_due_for_credit_reset() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_own_profile_protected_fields() TO authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule('trigger-renew-free-credits');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'trigger-renew-free-credits',
  '0 0 * * *',
  $$
  DO $do$
  DECLARE
    secret_key TEXT;
    target_url TEXT;
  BEGIN
    SELECT decrypted_secret INTO secret_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;

    target_url := 'http://kong:8000/functions/v1/renew-free-credits';

    IF secret_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := target_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || secret_key
        ),
        body := '{}'::jsonb
      );
    END IF;
  END;
  $do$
  $$
);
