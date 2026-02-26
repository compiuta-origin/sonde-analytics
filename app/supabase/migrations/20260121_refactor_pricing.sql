-- Drop old tables/functions
DROP TABLE IF EXISTS user_secrets;

-- Update Profiles
-- First, drop the column if it exists
ALTER TABLE profiles DROP COLUMN IF EXISTS openrouter_api_key;
ALTER TABLE profiles DROP COLUMN IF EXISTS openrouter_key_preview;

-- Drop existing constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_tier_check;

-- Update existing data to match new schema BEFORE adding the new constraint
UPDATE profiles SET tier = 'free' WHERE tier = 'free_byok';
UPDATE profiles SET tier = 'pro' WHERE tier = 'pro_cloud';
UPDATE profiles SET tier = 'enterprise' WHERE tier = 'enterprise_cloud';

-- Add new constraint now that data is compliant
ALTER TABLE profiles ADD CONSTRAINT profiles_tier_check CHECK (tier IN ('free', 'pro', 'enterprise'));

-- Reset credits for free users to 2
UPDATE profiles SET credits_balance = 2 WHERE tier = 'free';

-- Create Tiers table
CREATE TABLE IF NOT EXISTS tiers (
    id text PRIMARY KEY,
    name text NOT NULL,
    monthly_credits int NOT NULL,
    allowed_models text[] DEFAULT '{}'
);

-- Enable RLS
ALTER TABLE tiers ENABLE ROW LEVEL SECURITY;

-- Allow READ access to all authenticated users
CREATE POLICY "Allow read access to all authenticated users"
ON tiers FOR SELECT
TO authenticated
USING (true);

INSERT INTO tiers (id, name, monthly_credits, allowed_models) VALUES
('free', 'Free', 2, '{"google/gemini-2.0-flash-exp:free"}'),
('pro', 'Pro', 100, '{"google/gemini-2.0-flash-exp:free", "openai/gpt-4o"}'),
('enterprise', 'Enterprise', 1000, '{"google/gemini-2.0-flash-exp:free", "openai/gpt-4o", "anthropic/claude-3-opus"}')
ON CONFLICT (id) DO UPDATE SET
    monthly_credits = EXCLUDED.monthly_credits,
    allowed_models = EXCLUDED.allowed_models;

-- Create function to reset free tier credits
CREATE OR REPLACE FUNCTION public.reset_free_tier_credits()
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.profiles
  SET credits_balance = 2
  WHERE tier = 'free' AND credits_balance < 2;
END;
$$;
