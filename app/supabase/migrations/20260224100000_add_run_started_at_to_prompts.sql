-- Track when a prompt execution lock was acquired so stale locks can be recovered
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS run_started_at TIMESTAMPTZ;

-- Prevent immediate stale-lock recovery on existing locked rows after deploy
UPDATE prompts
SET run_started_at = NOW()
WHERE is_running = true
  AND run_started_at IS NULL;

CREATE INDEX IF NOT EXISTS prompts_is_running_run_started_at_idx
  ON prompts (is_running, run_started_at);
