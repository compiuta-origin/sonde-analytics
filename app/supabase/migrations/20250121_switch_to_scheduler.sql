-- Cleanup previous cron attempts
DROP FUNCTION IF EXISTS execute_scheduled_prompts();
DROP FUNCTION IF EXISTS execute_single_prompt(UUID);
DROP TABLE IF EXISTS prompt_execution_queue;

-- UNSCHEDULE old pg_cron jobs if they exist
DO $$
BEGIN
    PERFORM cron.unschedule('setup-prompt-schedules');
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- Clean up individual prompt schedules (this is a bit nuclear but safe if we are moving systems)
-- DELETE FROM cron.job WHERE jobname LIKE 'execute-prompt-%';

-- Add next_run_at column to prompts
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ;

-- Initialize next_run_at for existing active scheduled prompts
UPDATE prompts 
SET next_run_at = NOW() 
WHERE is_active = true 
  AND schedule_cron IS NOT NULL 
  AND schedule_cron != ''
  AND next_run_at IS NULL;

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "pg_net";

-- Schedule the master scheduler function using secrets from vault
-- We use a DO block to ensure the job is scheduled with the correct logic to fetch the secret at runtime
SELECT cron.schedule(
  'trigger-scheduler',
  '* * * * *',
  $$
  DO $do$
  DECLARE
    secret_key TEXT;
    target_url TEXT;
  BEGIN
    -- Try to get the secret from vault
    SELECT decrypted_secret INTO secret_key FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
    
    -- Use the internal Docker host URL for self-hosted / local environments
    target_url := 'http://kong:8000/functions/v1/scheduler';

    IF secret_key IS NOT NULL THEN
      PERFORM
        net.http_post(
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

