// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import parser from 'https://esm.sh/cron-parser@4.8.1';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getStaleLockTimeoutMinutes } from '../_shared/stale-lock.ts';

/**
 * Calculate exponential backoff delay in minutes
 * @param failedAttempts Number of consecutive failures
 * @returns Delay in minutes, capped at 24 hours (1440 minutes)
 */
function calculateExponentialBackoff(failedAttempts: number): number {
  // Base delay: 1 minute, exponential growth: 2^attempts
  // Cap at 24 hours to prevent excessive delays
  const backoffMinutes = Math.min(Math.pow(2, failedAttempts) * 1, 24 * 60);
  return backoffMinutes;
}

function isRetryableExecutorDispatchError(status: number): boolean {
  return status === 429 || status >= 500;
}

serve(async (req) => {
  try {
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
    }

    const authHeader = req.headers.get('Authorization');
    if (authHeader !== `Bearer ${supabaseKey}`) {
      console.error('[SCHEDULER] Unauthorized access attempt');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });

    // 1. Fetch active prompts that are due
    const now = new Date();
    const nowIso = now.toISOString();
    const staleLockTimeoutMinutes = getStaleLockTimeoutMinutes();
    const staleLockCutoff = new Date(
      now.getTime() - staleLockTimeoutMinutes * 60000,
    );
    console.log(`[SCHEDULER] Querying prompts due before or at: ${nowIso}`);

    const { data: prompts, error } = await supabase
      .from('prompts')
      .select(
        'id, schedule_cron, next_run_at, failed_attempts, last_failure_at, is_running, run_started_at',
      )
      .eq('is_active', true)
      .neq('schedule_cron', null)
      .neq('schedule_cron', '')
      .or(`next_run_at.lte.${nowIso},next_run_at.is.null`);

    if (error) {
      console.error('[SCHEDULER] Query error:', error);
      throw error;
    }

    if (!prompts || prompts.length === 0) {
      console.log('[SCHEDULER] No prompts due. (Query returned 0 results)');
      return new Response(JSON.stringify({ message: 'No prompts due' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(`[SCHEDULER] Found ${prompts.length} prompts due.`);
    console.log(
      `[SCHEDULER] Prompt IDs: ${prompts.map((p) => p.id).join(', ')}`,
    );

    const results = [];

    // 2. Process each prompt
    for (const prompt of prompts) {
      console.log(`[SCHEDULER] Processing prompt ${prompt.id}`);

      const runStartedAt = prompt.run_started_at
        ? new Date(prompt.run_started_at)
        : null;
      const hasStaleLock =
        prompt.is_running && (!runStartedAt || runStartedAt <= staleLockCutoff);

      if (prompt.is_running && !hasStaleLock) {
        console.log(
          `[SCHEDULER] Prompt ${prompt.id} is currently running (started at ${runStartedAt?.toISOString() || 'unknown'}), skipping`,
        );
        results.push({
          id: prompt.id,
          status: 'running',
          run_started_at: prompt.run_started_at,
        });
        continue;
      }

      if (hasStaleLock) {
        console.log(
          `[SCHEDULER] Prompt ${prompt.id} has stale lock from ${prompt.run_started_at || 'unknown'}, attempting recovery`,
        );
      }

      // Check if this prompt has recent failures and needs exponential backoff
      const failedAttempts = prompt.failed_attempts || 0;
      const lastFailureAt = prompt.last_failure_at
        ? new Date(prompt.last_failure_at)
        : null;

      let shouldExecuteNow = true;
      let nextRunDate = null;
      let scheduleStatus = 'scheduled';
      let terminalExecutorError: string | null = null;
      let terminalExecutorStatus: number | null = null;

      if (failedAttempts > 0 && lastFailureAt) {
        // Calculate exponential backoff delay
        const backoffMinutes = calculateExponentialBackoff(failedAttempts);
        const retryTime = new Date(
          lastFailureAt.getTime() + backoffMinutes * 60000,
        );

        console.log(
          `[SCHEDULER] Prompt ${prompt.id} has ${failedAttempts} failed attempts. Backoff: ${backoffMinutes} minutes`,
        );

        if (retryTime > now) {
          // Still in backoff period, don't execute yet
          shouldExecuteNow = false;
          scheduleStatus = 'backoff';
          nextRunDate = retryTime;
          console.log(
            `[SCHEDULER] Prompt ${prompt.id} in backoff until ${retryTime.toISOString()}`,
          );
        }
      }

      if (shouldExecuteNow) {
        // A. Invoke the Executor and confirm dispatch before advancing schedule
        const executorUrl = `${supabaseUrl}/functions/v1/executor`;
        let dispatched = false;

        try {
          const executorResponse = await fetch(executorUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({ prompt_id: prompt.id }),
          });

          if (!executorResponse.ok) {
            const errorText = await executorResponse.text();
            console.error(
              `[SCHEDULER] Executor returned ${executorResponse.status} for ${prompt.id}: ${errorText}`,
            );
            if (isRetryableExecutorDispatchError(executorResponse.status)) {
              results.push({
                id: prompt.id,
                status: 'executor_error_retryable',
                error: errorText,
              });
              continue;
            }

            // Non-retryable executor rejection (for example insufficient credits).
            // Advance next_run_at to avoid retrying every minute.
            scheduleStatus = 'executor_error_terminal';
            terminalExecutorError = errorText;
            terminalExecutorStatus = executorResponse.status;
          }

          dispatched = true;
        } catch (err) {
          console.error(
            `[SCHEDULER] Failed to trigger executor for ${prompt.id}:`,
            err,
          );
          results.push({
            id: prompt.id,
            status: 'executor_error_retryable',
            error: err.message,
          });
          continue;
        }

        if (!dispatched) {
          continue;
        }
      }

      // B. Calculate Next Run
      try {
        if (failedAttempts >= 3) {
          // After 3 failed attempts, use the regular schedule but keep failure count
          // This prevents constant retries while still allowing the prompt to run on schedule
          const interval = parser.parseExpression(prompt.schedule_cron, {
            currentDate: new Date(),
          });
          nextRunDate = interval.next().toDate();
        } else if (nextRunDate) {
          // Use the backoff calculated date
          // No change needed, nextRunDate is already set
        } else {
          // Normal case: calculate next run based on cron
          const interval = parser.parseExpression(prompt.schedule_cron, {
            currentDate: new Date(),
          });
          nextRunDate = interval.next().toDate();
        }

        // C. Update Database
        const { error: updateError } = await supabase
          .from('prompts')
          .update({ next_run_at: nextRunDate.toISOString() })
          .eq('id', prompt.id);

        if (updateError) {
          console.error(
            `[SCHEDULER] Failed to update next_run_at for ${prompt.id}:`,
            updateError,
          );
          results.push({
            id: prompt.id,
            status: 'failed_update',
            error: updateError,
          });
        } else {
          const result: any = {
            id: prompt.id,
            status: scheduleStatus,
            next_run: nextRunDate,
            failed_attempts: failedAttempts,
          };
          if (terminalExecutorError) {
            result.executor_status = terminalExecutorStatus;
            result.executor_error = terminalExecutorError;
          }
          results.push(result);
        }
      } catch (err) {
        console.error(`[SCHEDULER] Cron parse error for ${prompt.id}:`, err);
        results.push({ id: prompt.id, status: 'error', error: err.message });
      }
    }

    return new Response(JSON.stringify({ success: true, processed: results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[SCHEDULER] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
