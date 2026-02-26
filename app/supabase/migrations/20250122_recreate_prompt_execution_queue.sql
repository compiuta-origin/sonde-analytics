-- Recreate prompt_execution_queue table that was dropped in 20250121_switch_to_scheduler
-- This table is still used by the executor function

CREATE TABLE IF NOT EXISTS prompt_execution_queue (
  prompt_id UUID PRIMARY KEY REFERENCES prompts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INT DEFAULT 0,
  last_retry_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE prompt_execution_queue ENABLE ROW LEVEL SECURITY;

-- RLS: select
CREATE POLICY "Users can view their own prompt executions"
  ON prompt_execution_queue
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM prompts
      WHERE prompts.id = prompt_execution_queue.prompt_id
        AND prompts.user_id = (select auth.uid())
    )
  );

-- RLS: insert
CREATE POLICY "Users can insert into queue for their prompts"
  ON prompt_execution_queue
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM prompts
      WHERE prompts.id = prompt_execution_queue.prompt_id
        AND prompts.user_id = (select auth.uid())
    )
  );

-- RLS: update
CREATE POLICY "Users can update their own prompt executions"
  ON prompt_execution_queue
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM prompts
      WHERE prompts.id = prompt_execution_queue.prompt_id
        AND prompts.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM prompts
      WHERE prompts.id = prompt_execution_queue.prompt_id
        AND prompts.user_id = (select auth.uid())
    )
  );

-- RLS: delete
CREATE POLICY "Users can delete their own prompt executions"
  ON prompt_execution_queue
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM prompts
      WHERE prompts.id = prompt_execution_queue.prompt_id
        AND prompts.user_id = (select auth.uid())
    )
  );

-- Permissions
REVOKE ALL ON TABLE prompt_execution_queue FROM public;
GRANT SELECT, INSERT, UPDATE ON TABLE prompt_execution_queue
  TO postgres, supabase_admin, authenticated;