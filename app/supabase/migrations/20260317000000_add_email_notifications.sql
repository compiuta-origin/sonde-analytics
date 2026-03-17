-- Add notification preference to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS notify_on_completion BOOLEAN NOT NULL DEFAULT true;

-- Add batch_id to group all runs created in the same executor invocation
ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS batch_id UUID;

-- Add judged_at to signal that the judge has finished processing a run
-- (set after all rule evaluations are written, regardless of rule count)
ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS judged_at TIMESTAMPTZ;

-- Track sent notifications to prevent duplicate emails per batch
CREATE TABLE IF NOT EXISTS run_notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id   UUID        NOT NULL UNIQUE,
  prompt_id  UUID        NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- run_notifications is only written and read by the notify edge function
-- (service role, which bypasses RLS). No client-facing access needed.
ALTER TABLE run_notifications ENABLE ROW LEVEL SECURITY;

-- Schedule the notify function to run every minute via pg_cron (same pattern as trigger-scheduler)
SELECT cron.schedule(
  'trigger-notify',
  '* * * * *',
  $$
  DO $do$
  DECLARE
    secret_key TEXT;
    target_url TEXT;
  BEGIN
    SELECT decrypted_secret INTO secret_key FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
    target_url := 'http://kong:8000/functions/v1/notify';
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

-- Returns batches where every run has been judged and no email has been sent yet.
-- Called by the notify edge function (service role) on each cron tick.
-- Access is restricted to service_role only — anon/authenticated cannot call this.
CREATE OR REPLACE FUNCTION get_ready_notification_batches()
RETURNS TABLE (batch_id UUID, prompt_id UUID)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT DISTINCT r.batch_id, r.prompt_id
  FROM runs r
  JOIN prompts p   ON p.id  = r.prompt_id
  JOIN profiles pr ON pr.id = p.user_id
  WHERE r.batch_id IS NOT NULL
    AND pr.notify_on_completion = true
    -- batch not yet claimed
    AND NOT EXISTS (
      SELECT 1 FROM run_notifications rn WHERE rn.batch_id = r.batch_id
    )
    -- every run in this batch has been judged
    AND NOT EXISTS (
      SELECT 1 FROM runs r2
      WHERE r2.batch_id = r.batch_id
        AND r2.judged_at IS NULL
    );
$$;

REVOKE EXECUTE ON FUNCTION get_ready_notification_batches() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_ready_notification_batches() FROM anon;
REVOKE EXECUTE ON FUNCTION get_ready_notification_batches() FROM authenticated;
GRANT  EXECUTE ON FUNCTION get_ready_notification_batches() TO service_role;
