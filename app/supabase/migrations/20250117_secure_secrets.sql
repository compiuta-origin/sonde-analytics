-- Create a table for encrypted secrets, accessible only via service role
create table user_secrets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  secret_name text not null,
  encrypted_value text not null, -- Format: iv:authTag:ciphertext
  version int default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, secret_name)
);

-- Enable RLS but add no policies (effectively denying all client access)
alter table user_secrets enable row level security;

-- Add a preview column to profiles so the UI knows a key exists
alter table profiles add column openrouter_key_preview text;

-- Cleanup: We will remove openrouter_api_key from profiles after we've migrated logic
-- alter table profiles drop column openrouter_api_key;
