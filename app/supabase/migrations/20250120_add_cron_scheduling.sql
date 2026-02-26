-- Enable pg_cron extension for scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a queue table for prompt executions
CREATE TABLE IF NOT EXISTS prompt_execution_queue (
  prompt_id UUID PRIMARY KEY REFERENCES prompts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT
);

-- Create a function to execute a single prompt
CREATE OR REPLACE FUNCTION execute_single_prompt(prompt_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO prompt_execution_queue (prompt_id, created_at)
  VALUES (prompt_id, NOW())
  ON CONFLICT (prompt_id) DO UPDATE
    SET created_at = NOW();
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Failed to queue prompt %: %', prompt_id, SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION execute_single_prompt(UUID) OWNER TO postgres;

-- Create a function to schedule prompts based on their cron expressions
CREATE OR REPLACE FUNCTION execute_scheduled_prompts()
RETURNS void AS $$
DECLARE
  prompt_record RECORD;
BEGIN
  FOR prompt_record IN
    SELECT id, schedule_cron
    FROM prompts
    WHERE is_active = TRUE
      AND schedule_cron IS NOT NULL
      AND schedule_cron <> ''
  LOOP
    PERFORM cron.schedule(
      'execute-prompt-' || prompt_record.id,
      prompt_record.schedule_cron,
      format(
        'SELECT execute_single_prompt(%L)',
        prompt_record.id
      )
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION execute_scheduled_prompts() OWNER TO postgres;

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

REVOKE ALL ON FUNCTION execute_scheduled_prompts() FROM public;
REVOKE ALL ON FUNCTION execute_single_prompt(UUID) FROM public;

GRANT EXECUTE ON FUNCTION execute_scheduled_prompts()
  TO postgres, supabase_admin;
GRANT EXECUTE ON FUNCTION execute_single_prompt(UUID)
  TO postgres, supabase_admin;

-- Schedule the scheduler
SELECT cron.schedule(
  'setup-prompt-schedules',
  '* * * * *',
  'SELECT execute_scheduled_prompts()'
);
