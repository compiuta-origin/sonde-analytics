-- Add is_running column to prompts to prevent concurrent executions
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS is_running BOOLEAN DEFAULT false;
