// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import {
  MODEL_FAMILIES_CONFIG,
  getModelForTier,
} from '../_shared/model-config.ts';
import { getStaleLockTimeoutMinutes } from '../_shared/stale-lock.ts';
import { OpenRouterClient } from '../openrouter-client.ts';

interface TargetConfig {
  model: string;
  use_search: boolean;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let promptId: string | null = null;
  let supabase: any = null;

  try {
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
    }

    const authHeader = req.headers.get('Authorization');
    if (authHeader !== `Bearer ${supabaseKey}`) {
      console.error('[EXECUTOR] Unauthorized access attempt');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    try {
      const body = await req.json();
      promptId = body?.prompt_id ?? null;
    } catch {
      // Body might be empty, continue with null promptId
    }

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL not configured');
    }

    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    if (!promptId) {
      throw new Error('prompt_id is required');
    }

    const { data: prompt, error: promptError } = await supabase
      .from('prompts')
      .select('id, is_running, run_started_at, profiles(credits_balance)')
      .eq('id', promptId)
      .single();

    if (promptError || !prompt) {
      throw new Error('Prompt not found');
    }

    const staleLockTimeoutMinutes = getStaleLockTimeoutMinutes();
    const staleLockCutoff = new Date(
      Date.now() - staleLockTimeoutMinutes * 60000,
    );
    const runStartedAt = prompt.run_started_at
      ? new Date(prompt.run_started_at)
      : null;
    const hasStaleLock =
      prompt.is_running && (!runStartedAt || runStartedAt <= staleLockCutoff);

    // If currently running with a fresh lock, return early
    if (prompt.is_running && !hasStaleLock) {
      console.log(
        '[EXECUTOR] Execution already in progress for prompt:',
        promptId,
      );
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Execution already in progress',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    if (hasStaleLock) {
      console.warn(
        '[EXECUTOR] Recovering stale lock for prompt:',
        promptId,
        'run_started_at:',
        prompt.run_started_at,
      );
    }

    if (prompt.profiles.credits_balance <= 0) {
      throw new Error(
        'Insufficient credits. Please upgrade your plan or wait for the monthly refill.',
      );
    }

    // Attempt to acquire lock atomically
    const lockAcquiredAt = new Date().toISOString();
    let updateQuery = supabase
      .from('prompts')
      .update({ is_running: true, run_started_at: lockAcquiredAt })
      .eq('id', promptId);

    if (!prompt.is_running) {
      updateQuery = updateQuery.eq('is_running', false);
    } else if (hasStaleLock) {
      updateQuery = updateQuery.eq('is_running', true);
      if (prompt.run_started_at) {
        updateQuery = updateQuery.eq('run_started_at', prompt.run_started_at);
      } else {
        updateQuery = updateQuery.is('run_started_at', null);
      }
    }

    const { data: updatedPrompt, error: updateError } = await updateQuery
      .select('id')
      .single();

    if (updateError || !updatedPrompt) {
      console.log(
        '[EXECUTOR] Could not acquire lock (already running):',
        promptId,
      );
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Execution already in progress',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    console.log('[EXECUTOR] Scheduling execution for prompt:', promptId);

    EdgeRuntime.waitUntil(processExecution(promptId, supabaseUrl, supabaseKey));

    return new Response(
      JSON.stringify({ success: true, message: 'Execution started' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    console.error('[EXECUTOR] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function processExecution(
  promptId: string,
  supabaseUrl: string,
  supabaseKey: string,
) {
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  try {
    console.log('[EXECUTOR] [ASYNC] Starting execution for prompt:', promptId);

    // Fetch prompt with user profile
    const { data: prompt, error: promptError } = await supabase
      .from('prompts')
      .select(
        `
        id,
        query_text,
        target_config,
        failed_attempts,
        user_id,
        profiles (
          id,
          credits_balance
        )
      `,
      )
      .eq('id', promptId)
      .single();

    if (promptError || !prompt) {
      console.error('[EXECUTOR] [ASYNC] Prompt fetch error:', promptError);
      throw new Error('Prompt not found');
    }

    const profile = prompt.profiles;
    if (!profile) {
      throw new Error('Profile not found');
    }

    // Fetch user's subscription plan for model enforcement
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan')
      .eq('user_id', prompt.user_id)
      .single();

    const userTier = subscription?.plan || 'free';

    // Check credits again in background
    if (profile.credits_balance <= 0) {
      throw new Error(
        'Insufficient credits. Please upgrade your plan or wait for the monthly refill.',
      );
    }

    // Use system key
    const apiKey = Deno.env.get('SYSTEM_OPENROUTER_KEY');
    if (!apiKey) {
      throw new Error('System OpenRouter key not configured');
    }

    const targetConfigs: TargetConfig[] =
      prompt.target_config as TargetConfig[];
    if (!Array.isArray(targetConfigs) || targetConfigs.length === 0) {
      throw new Error('No target models configured for this prompt');
    }
    const results = [];

    for (const target of targetConfigs) {
      console.log(
        `[EXECUTOR] [ASYNC] Executing model: ${target.model}, web_search: ${target.use_search}`,
      );

      // Validate model is allowed for user's plan
      if (!isModelAllowedForTier(target.model, userTier)) {
        console.log(
          `[EXECUTOR] [ASYNC] Model ${target.model} not allowed for tier ${userTier}`,
        );
        results.push({
          success: false,
          model: target.model,
          error: 'Model not allowed for your plan',
        });
        continue;
      }

      try {
        const result = await executeModel(
          apiKey,
          prompt.query_text,
          target.model,
          target.use_search,
          userTier === 'free' ? 'medium' : 'high',
        );

        console.log(
          `[EXECUTOR] [ASYNC] Model ${target.model} completed. Tokens: ${result.tokenUsage.input}/${result.tokenUsage.output}`,
        );

        // Save run to database
        const { data: run, error: runError } = await supabase
          .from('runs')
          .insert({
            prompt_id: prompt.id,
            model_used: target.model,
            web_search_enabled: target.use_search,
            response_text: result.response,
            token_usage_input: result.tokenUsage.input,
            token_usage_output: result.tokenUsage.output,
          })
          .select()
          .single();

        if (runError) {
          console.error('[EXECUTOR] [ASYNC] Failed to save run:', runError);
          results.push({
            success: false,
            model: target.model,
            error: runError.message || 'Failed to save run',
          });
          continue;
        }

        console.log('[EXECUTOR] [ASYNC] Run saved:', run.id);

        // Trigger judge function
        console.log('[EXECUTOR] [ASYNC] Triggering judge for run:', run.id);
        const judgeResponse = await fetch(`${supabaseUrl}/functions/v1/judge`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${supabaseKey}`,
            apikey: supabaseKey,
          },
          body: JSON.stringify({ run_id: run.id }),
        });

        if (!judgeResponse.ok) {
          const judgeErrorText = await judgeResponse.text();
          console.error(
            '[EXECUTOR] [ASYNC] Judge trigger failed:',
            judgeErrorText,
          );
          results.push({
            success: false,
            run_id: run.id,
            model: target.model,
            error: `Judge failed: ${judgeErrorText}`,
          });
          continue;
        }

        results.push({
          success: true,
          run_id: run.id,
          model: target.model,
        });
      } catch (error) {
        console.error(
          `[EXECUTOR] [ASYNC] Failed to execute ${target.model}:`,
          error,
        );
        results.push({
          success: false,
          model: target.model,
          error: error.message,
        });
      }
    }

    console.log('[EXECUTOR] [ASYNC] Execution complete. Results:', results);

    const allSucceeded = results.every((r) => r.success);
    if (allSucceeded) {
      const { data: creditData, error: creditError } = await supabase.rpc(
        'decrement_profile_credits_if_available',
        {
          p_profile_id: profile.id,
          p_amount: 1,
        },
      );

      const updatedBalance =
        Array.isArray(creditData) && creditData.length > 0
          ? creditData[0]?.new_balance
          : null;

      if (creditError) {
        console.error(
          '[EXECUTOR] [ASYNC] Failed to deduct credit after successful execution:',
          creditError,
        );
      } else if (updatedBalance === null || updatedBalance === undefined) {
        console.warn(
          '[EXECUTOR] [ASYNC] Credit not deducted (insufficient balance or concurrent usage):',
          profile.id,
        );
      } else {
        console.log(
          `[EXECUTOR] [ASYNC] Deducted 1 credit. New balance: ${updatedBalance}`,
        );
      }

      // Reset failed attempts on success
      await supabase
        .from('prompts')
        .update({
          failed_attempts: 0,
          last_failure_at: null,
          is_running: false,
          run_started_at: null,
        })
        .eq('id', promptId);
    } else {
      const failedAttempts = prompt.failed_attempts || 0;
      await supabase
        .from('prompts')
        .update({
          failed_attempts: failedAttempts + 1,
          last_failure_at: new Date().toISOString(),
          is_running: false,
          run_started_at: null,
        })
        .eq('id', promptId);
    }
  } catch (error) {
    console.error('[EXECUTOR] [ASYNC] Error:', error);

    // Handle failure tracking and release lock
    try {
      const { data: promptData } = await supabase
        .from('prompts')
        .select('failed_attempts')
        .eq('id', promptId)
        .single();

      let failedAttempts = 0;
      if (promptData) {
        failedAttempts = promptData.failed_attempts || 0;
      }

      await supabase
        .from('prompts')
        .update({
          failed_attempts: failedAttempts + 1,
          last_failure_at: new Date().toISOString(),
          is_running: false,
          run_started_at: null,
        })
        .eq('id', promptId);
    } catch (trackError) {
      console.error('[EXECUTOR] [ASYNC] Failed to track failure:', trackError);
      // Try to at least release the lock if tracking fails
      try {
        await supabase
          .from('prompts')
          .update({ is_running: false, run_started_at: null })
          .eq('id', promptId);
      } catch (finalError) {
        console.error(
          '[EXECUTOR] [ASYNC] CRITICAL: Failed to release lock:',
          finalError,
        );
      }
    }
  }
}

function isModelAllowedForTier(modelId: string, tier: string): boolean {
  const tierHierarchy = ['free', 'pro', 'enterprise'];
  const tierIndex = tierHierarchy.indexOf(tier);
  const allowedTiers =
    tierIndex === -1 ? ['free'] : tierHierarchy.slice(0, tierIndex + 1);

  for (const family of MODEL_FAMILIES_CONFIG) {
    for (const allowedTier of allowedTiers) {
      if (getModelForTier(family.id, allowedTier).id === modelId) return true;
    }
  }
  return false;
}

async function executeModel(
  apiKey: string,
  query: string,
  model: string,
  useSearch: boolean,
  searchContextSize: 'low' | 'medium' | 'high' = 'medium',
): Promise<{
  response: string;
  tokenUsage: { input: number; output: number };
}> {
  const client = new OpenRouterClient(apiKey);

  console.log(`[EXECUTOR] [ASYNC] Calling OpenRouter for ${model}...`);

  const result = await client.executePrompt(
    query,
    model,
    useSearch,
    searchContextSize,
  );

  return {
    response: result.response,
    tokenUsage: {
      input: result.tokenUsage.input,
      output: result.tokenUsage.output,
    },
  };
}
