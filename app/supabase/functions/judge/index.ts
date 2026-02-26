// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { OpenRouterClient } from '../openrouter-client.ts';

interface Rule {
  id: string;
  name: string;
  description: string;
  type: 'binary' | 'ranking' | 'sentiment';
}

interface JudgeResponse {
  score: number;
  reasoning: string;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
    }

    // Authorization check
    const authHeader = req.headers.get('Authorization');
    if (authHeader !== `Bearer ${supabaseKey}`) {
      console.error('[JUDGE] Unauthorized access attempt');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { run_id } = await req.json();

    if (!run_id) {
      throw new Error('run_id is required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: run, error: runError } = await supabase
      .from('runs')
      .select('id')
      .eq('id', run_id)
      .single();

    if (runError || !run) {
      throw new Error('Run not found');
    }

    console.log('[JUDGE] Scheduling evaluation for run:', run_id);

    EdgeRuntime.waitUntil(processEvaluation(run_id, supabaseUrl, supabaseKey));

    return new Response(
      JSON.stringify({ success: true, message: 'Evaluation started' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[JUDGE] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function processEvaluation(
  runId: string,
  supabaseUrl: string,
  supabaseKey: string,
) {
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    console.log('[JUDGE] [ASYNC] Starting evaluation for run:', runId);

    // Get system OpenRouter key for judge
    const judgeApiKey = Deno.env.get('SYSTEM_OPENROUTER_KEY');
    if (!judgeApiKey) {
      console.log('[JUDGE] [ASYNC] No system key found, judge will be skipped');
      return;
    }

    // Fetch run with associated prompt and rules
    const { data: run, error: runError } = await supabase
      .from('runs')
      .select(
        `
        id,
        response_text,
        prompts (
          id,
          rules (
            id,
            name,
            description,
            type
          )
        )
      `,
      )
      .eq('id', runId)
      .single();

    if (runError || !run) {
      console.error('[JUDGE] [ASYNC] Run fetch error:', runError);
      return;
    }

    if (!run.response_text) {
      console.log('[JUDGE] [ASYNC] No response text to evaluate');
      return;
    }

    const rules: Rule[] = run.prompts.rules || [];
    console.log(`[JUDGE] [ASYNC] Found ${rules.length} rules to evaluate`);

    if (rules.length === 0) {
      console.log('[JUDGE] [ASYNC] No rules defined for this prompt');
      return;
    }

    // Evaluate each rule
    for (const rule of rules) {
      console.log(
        `[JUDGE] [ASYNC] Evaluating rule: ${rule.name} (${rule.type})`,
      );

      try {
        const evaluation = await evaluateRule(
          judgeApiKey,
          run.response_text,
          rule,
        );

        console.log(
          `[JUDGE] [ASYNC] Rule "${rule.name}" score: ${evaluation.score}`,
        );

        const { error: insertError } = await supabase
          .from('evaluations')
          .insert({
            run_id: run.id,
            rule_id: rule.id,
            score: evaluation.score,
            reasoning: evaluation.reasoning,
          });

        if (insertError) {
          console.error(
            `[JUDGE] [ASYNC] Failed to save evaluation for rule ${rule.id}:`,
            insertError,
          );
        }
      } catch (error) {
        console.error(
          `[JUDGE] [ASYNC] Failed to evaluate rule ${rule.id}:`,
          error,
        );
      }
    }

    console.log('[JUDGE] [ASYNC] Evaluation complete');
  } catch (error) {
    console.error('[JUDGE] [ASYNC] Unexpected error:', error);
  }
}

async function evaluateRule(
  apiKey: string,
  responseText: string,
  rule: Rule,
): Promise<JudgeResponse> {
  const client = new OpenRouterClient(apiKey);

  console.log(`[JUDGE] [ASYNC] Calling judge LLM for rule: ${rule.name}`);

  const result = await client.judge(responseText, rule.description, rule.type);

  return result;
}
