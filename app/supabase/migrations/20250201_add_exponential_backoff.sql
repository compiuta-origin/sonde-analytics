-- Add fields for exponential backoff retry logic
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS failed_attempts INT DEFAULT 0;
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS last_failure_at TIMESTAMPTZ;

-- Note: retry_count and last_retry_at columns are now included in the
-- prompt_execution_queue table creation in migration 20250122_recreate_prompt_execution_queue.sql

-- Update RLS policies to include new fields
ALTER POLICY "Users can view own prompts" ON prompts USING ((select auth.uid()) = user_id);
ALTER POLICY "Users can update own prompts" ON prompts USING ((select auth.uid()) = user_id);

ALTER POLICY "Users can view their own prompt executions" ON prompt_execution_queue USING (
  EXISTS (
    SELECT 1
    FROM prompts
    WHERE prompts.id = prompt_execution_queue.prompt_id
      AND prompts.user_id = (select auth.uid())
  )
);

ALTER POLICY "Users can update their own prompt executions" ON prompt_execution_queue USING (
  EXISTS (
    SELECT 1
    FROM prompts
    WHERE prompts.id = prompt_execution_queue.prompt_id
      AND prompts.user_id = (select auth.uid())
  )
);