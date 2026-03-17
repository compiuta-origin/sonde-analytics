// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseKey)
      throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');

    const authHeader = req.headers.get('Authorization');
    if (authHeader !== `Bearer ${supabaseKey}`) {
      console.error('[NOTIFY] Unauthorized access attempt');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    if (!supabaseUrl) throw new Error('SUPABASE_URL not configured');

    const mjPublicKey = Deno.env.get('MAILJET_API_KEY');
    const mjPrivateKey = Deno.env.get('MAILJET_API_SECRET');
    const mjFromEmail = Deno.env.get('MAILJET_FROM_EMAIL');
    if (!mjPublicKey || !mjPrivateKey || !mjFromEmail) {
      throw new Error('Mailjet credentials not configured');
    }

    const appUrl = Deno.env.get('SITE_URL');

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Find batches where every run has been judged and no email has been sent yet
    const { data: readyBatches, error: batchError } = await supabase.rpc(
      'get_ready_notification_batches',
    );

    if (batchError) {
      console.error('[NOTIFY] Failed to fetch ready batches:', batchError);
      throw batchError;
    }

    if (!readyBatches || readyBatches.length === 0) {
      console.log('[NOTIFY] No batches ready for notification');
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[NOTIFY] Found ${readyBatches.length} batch(es) ready`);

    let sent = 0;

    for (const batch of readyBatches) {
      const { batch_id, prompt_id } = batch;

      // Claim the batch — ON CONFLICT DO NOTHING prevents double-sends
      // if two notify invocations run concurrently
      const { error: claimError, count } = await supabase
        .from('run_notifications')
        .upsert({ batch_id, prompt_id }, {
          onConflict: 'batch_id',
          ignoreDuplicates: true,
          count: 'exact',
        });

      if (claimError) {
        console.error(
          `[NOTIFY] Failed to claim batch ${batch_id}:`,
          claimError,
        );
        continue;
      }

      if (count === 0) {
        console.log(`[NOTIFY] Batch ${batch_id} already claimed, skipping`);
        continue;
      }

      try {
        // Fetch all data needed for the email
        const { data: prompt, error: promptError } = await supabase
          .from('prompts')
          .select(
            `
            id,
            query_text,
            profiles ( email )
          `,
          )
          .eq('id', prompt_id)
          .single();

        if (promptError || !prompt) {
          console.error(`[NOTIFY] Prompt not found for batch ${batch_id}`);
          continue;
        }

        const userEmail = prompt.profiles?.email;
        if (!userEmail) {
          console.log(`[NOTIFY] No email for prompt ${prompt_id}, skipping`);
          continue;
        }

        const { data: runs, error: runsError } = await supabase
          .from('runs')
          .select(
            `
            id,
            model_used,
            response_text,
            executed_at,
            evaluations (
              score,
              reasoning,
              rules ( name, type )
            )
          `,
          )
          .eq('batch_id', batch_id)
          .order('executed_at', { ascending: true });

        if (runsError || !runs || runs.length === 0) {
          console.error(`[NOTIFY] No runs found for batch ${batch_id}`);
          continue;
        }

        const subject = buildSubject(prompt.query_text);
        const html = buildHtml(prompt.query_text, runs, appUrl);

        const mailjetRes = await fetch('https://api.mailjet.com/v3.1/send', {
          method: 'POST',
          headers: {
            Authorization: `Basic ${btoa(`${mjPublicKey}:${mjPrivateKey}`)}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            Messages: [
              {
                From: { Email: mjFromEmail, Name: 'Sonde' },
                To: [{ Email: userEmail }],
                Subject: subject,
                HTMLPart: html,
              },
            ],
          }),
        });

        if (!mailjetRes.ok) {
          const errText = await mailjetRes.text();
          console.error(
            `[NOTIFY] Mailjet error for batch ${batch_id}:`,
            errText,
          );
          continue;
        }

        console.log(`[NOTIFY] Email sent for batch ${batch_id} → ${userEmail}`);
        sent++;
      } catch (err) {
        console.error(`[NOTIFY] Failed to process batch ${batch_id}:`, err);
      }
    }

    return new Response(JSON.stringify({ sent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[NOTIFY] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function buildSubject(queryText: string): string {
  const preview =
    queryText.length > 60 ? queryText.slice(0, 60).trimEnd() + '…' : queryText;
  return `Run complete — ${preview}`;
}

function formatScore(score: number, type: string): string {
  if (type === 'binary') return score === 1 ? '✓' : '✗';
  if (type === 'sentiment') return score > 0 ? `+${score}` : `${score}`;
  return `${score}`;
}

function scoreColor(score: number, type: string): string {
  if (type === 'binary') return score === 1 ? '#4ade80' : '#f87171';
  if (type === 'sentiment') {
    if (score > 0) return '#4ade80';
    if (score < 0) return '#f87171';
    return '#a0a0a0';
  }
  return '#f59e0b';
}

function buildHtml(
  queryText: string,
  runs: any[],
  appUrl: string | undefined,
): string {
  const font = `Inter, system-ui, -apple-system, sans-serif`;
  const bg = `#09090b`;
  const surface = `#18181b`;
  const border = `#27272a`;
  const textPrimary = `#fafafa`;
  const textSecondary = `#a1a1aa`;
  const textMuted = `#52525b`;

  const runsHtml = runs
    .map((run) => {
      const evals: any[] = run.evaluations ?? [];

      const evalsHtml =
        evals.length > 0
          ? `<div style="margin-top:16px;border-top:1px solid ${border};padding-top:12px;">
          <div style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:${textMuted};margin-bottom:8px;">Evaluations</div>
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            ${evals
              .map((e) => {
                const rule = e.rules;
                const color = scoreColor(e.score, rule?.type ?? 'binary');
                const badge = formatScore(e.score, rule?.type ?? 'binary');
                return `<tr>
                <td width="36" valign="top" style="padding:5px 8px 5px 0;font-size:12px;font-weight:bold;color:${color};">${badge}</td>
                <td valign="top" style="padding:5px 0;border-bottom:1px solid ${bg};">
                  <div style="font-size:12px;color:${textSecondary};">${escapeHtml(rule?.name ?? '')}</div>
                  ${e.reasoning ? `<div style="font-size:11px;color:${textMuted};margin-top:2px;">${escapeHtml(e.reasoning)}</div>` : ''}
                </td>
              </tr>`;
              })
              .join('')}
          </table>
        </div>`
          : '';

      return `<div style="margin-bottom:16px;padding:16px;background:${surface};border:1px solid ${border};border-radius:2px;">
      <div style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:${textMuted};margin-bottom:10px;">${escapeHtml(run.model_used)}</div>
      <div style="font-size:13px;line-height:1.7;color:${textSecondary};white-space:pre-wrap;">${escapeHtml(run.response_text ?? '')}</div>
      ${evalsHtml}
    </div>`;
    })
    .join('');

  const settingsLink = appUrl
    ? `<a href="${appUrl}/settings" style="color:${textMuted};text-decoration:underline;">Manage settings</a>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:${bg};font-family:${font};color:${textPrimary};">
  <div style="max-width:620px;margin:0 auto;padding:40px 24px;">

    <div style="margin-bottom:32px;">
      <span style="font-size:13px;letter-spacing:0.2em;text-transform:uppercase;color:${textMuted};">Sonde</span>
    </div>

    <div style="margin-bottom:20px;padding:16px;background:${surface};border:1px solid ${border};border-radius:2px;">
      <div style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:${textMuted};margin-bottom:8px;">Prompt</div>
      <div style="font-size:14px;line-height:1.6;color:${textPrimary};">${escapeHtml(queryText)}</div>
    </div>

    ${runsHtml}

    <div style="margin-top:32px;padding-top:16px;border-top:1px solid ${border};">
      <span style="font-size:11px;color:${textMuted};">
        You received this because email notifications are enabled on your account.
        ${settingsLink}
      </span>
    </div>

  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
