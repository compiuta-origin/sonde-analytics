-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- PROFILES
create table profiles (
  id uuid references auth.users primary key,
  email text,
  tier text default 'free_byok' check (tier in ('free_byok', 'pro_cloud', 'enterprise')),
  credits_balance int default 0,
  openrouter_api_key text,
  created_at timestamptz default now()
);

-- RLS for profiles
alter table profiles enable row level security;

create policy "Users can view own profile"
  on profiles for select
  using ((select auth.uid()) = id);

create policy "Users can update own profile"
  on profiles for update
  using ((select auth.uid()) = id);

-- PROMPTS
create table prompts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  query_text text not null,
  schedule_cron text,
  is_active boolean default true,
  target_config jsonb not null,
  created_at timestamptz default now()
);
create index if not exists prompts_user_id_idx on prompts(user_id);

alter table prompts enable row level security;

create policy "Users can view own prompts"
  on prompts for select
  using ((select auth.uid()) = user_id);

create policy "Users can create own prompts"
  on prompts for insert
  with check ((select auth.uid()) = user_id);

create policy "Users can update own prompts"
  on prompts for update
  using ((select auth.uid()) = user_id);

create policy "Users can delete own prompts"
  on prompts for delete
  using ((select auth.uid()) = user_id);

-- RULES
create table rules (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid references prompts(id) on delete cascade,
  name text not null,
  description text not null,
  type text not null check (type in ('binary', 'ranking', 'sentiment')),
  created_at timestamptz default now()
);
create index if not exists rules_prompt_id_idx on rules(prompt_id);

alter table rules enable row level security;

create policy "Users can view rules for their prompts"
  on rules for select
  using (exists (
    select 1 from prompts
    where prompts.id = rules.prompt_id
    and prompts.user_id = (select auth.uid())
  ));

create policy "Users can manage rules for their prompts"
  on rules for insert
  with check (exists (
    select 1 from prompts
    where prompts.id = rules.prompt_id
    and prompts.user_id = (select auth.uid())
  ));

create policy "Users can update rules for their prompts"
  on rules for update
  using (exists (
    select 1 from prompts
    where prompts.id = rules.prompt_id
    and prompts.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from prompts
    where prompts.id = rules.prompt_id
    and prompts.user_id = (select auth.uid())
  ));

create policy "Users can delete rules for their prompts"
  on rules for delete
  using (exists (
    select 1 from prompts
    where prompts.id = rules.prompt_id
    and prompts.user_id = (select auth.uid())
  ));

-- RUNS
create table runs (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid references prompts(id),
  model_used text not null,
  web_search_enabled boolean default false,
  response_text text,
  token_usage_input int,
  token_usage_output int,
  cost_usd numeric,
  executed_at timestamptz default now()
);
create index if not exists runs_prompt_id_idx on runs(prompt_id);

alter table runs enable row level security;

create policy "Users can view runs for their prompts"
  on runs for select
  using (exists (
    select 1 from prompts
    where prompts.id = runs.prompt_id
    and prompts.user_id = (select auth.uid())
  ));

-- EVALUATIONS
create table evaluations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references runs(id) on delete cascade,
  rule_id uuid references rules(id),
  score numeric,
  reasoning text,
  created_at timestamptz default now()
);
create index if not exists evaluations_run_id_idx on evaluations(run_id);
create index if not exists evaluations_rule_id_idx on evaluations(rule_id);

alter table evaluations enable row level security;

create policy "Users can view evaluations for their runs"
  on evaluations for select
  using (exists (
    select 1 from runs
    join prompts on prompts.id = runs.prompt_id
    where runs.id = evaluations.run_id
    and prompts.user_id = (select auth.uid())
  ));

-- Function to create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
