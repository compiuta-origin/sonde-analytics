-- Create Subscriptions table
create table if not exists public.subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  plan text check (plan in ('free', 'pro', 'enterprise')) default 'free',
  status text,
  billing_interval text check (billing_interval in ('monthly', 'yearly')),
  trial_start timestamp with time zone,
  trial_end timestamp with time zone,
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  cancel_at_period_end boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create index for faster lookups
create index if not exists subscriptions_user_id_idx on public.subscriptions(user_id);
create index if not exists subscriptions_stripe_customer_id_idx on public.subscriptions(stripe_customer_id);
create index if not exists subscriptions_stripe_subscription_id_idx on public.subscriptions(stripe_subscription_id);

-- Enable Row Level Security
alter table public.subscriptions enable row level security;

-- RLS Policies for subscriptions
drop policy if exists "Users can view their own subscription" on public.subscriptions;
create policy "Users can view their own subscription"
  on public.subscriptions for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Service role can do everything (for webhooks)
drop policy if exists "Service role can manage all subscriptions" on public.subscriptions;
create policy "Service role can manage all subscriptions"
  on public.subscriptions for all
  to service_role
  using (true)
  with check (true);

-- Trigger to sync subscriptions.plan -> profiles.tier
CREATE OR REPLACE FUNCTION sync_subscription_plan_to_profile()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    UPDATE public.profiles
    SET tier = NEW.plan
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_subscription_plan ON public.subscriptions;
CREATE TRIGGER sync_subscription_plan
AFTER INSERT OR UPDATE OF plan ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION sync_subscription_plan_to_profile();
