import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

serve(async (req) => {
  try {
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');

    if (!supabaseKey || !supabaseUrl) {
      throw new Error('Supabase environment variables are not configured');
    }

    const authHeader = req.headers.get('Authorization');
    if (authHeader !== `Bearer ${supabaseKey}`) {
      console.error('[RENEW-FREE-CREDITS] Unauthorized access attempt');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });

    const { data: dueProfiles, error: dueProfilesError } = await supabase.rpc(
      'get_free_profiles_due_for_credit_reset',
    );

    if (dueProfilesError) {
      throw dueProfilesError;
    }

    if (!dueProfiles || dueProfiles.length === 0) {
      return new Response(
        JSON.stringify({ renewed: 0, message: 'No free users due for reset' }),
        {
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const results = [];

    for (const profile of dueProfiles) {
      const { data, error } = await supabase.rpc(
        'reset_user_credits_for_period',
        {
          p_user_id: profile.user_id,
          p_plan: 'free',
          p_reset_key: profile.reset_key,
        },
      );

      if (error) {
        console.error(
          '[RENEW-FREE-CREDITS] Failed to reset credits:',
          profile.user_id,
          error,
        );
        results.push({
          user_id: profile.user_id,
          reset_applied: false,
          error: error.message,
        });
        continue;
      }

      results.push({
        user_id: profile.user_id,
        ...(data ?? {}),
      });
    }

    return new Response(
      JSON.stringify({
        renewed: results.filter((result) => result.reset_applied).length,
        processed: results.length,
        results,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    console.error('[RENEW-FREE-CREDITS] Error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
});
