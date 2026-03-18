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
  if (type === 'binary') return score === 1 ? '#16a34a' : '#dc2626';
  if (type === 'sentiment') {
    if (score > 0) return '#16a34a';
    if (score < 0) return '#dc2626';
    return '#71717a';
  }
  return '#d97706';
}

function formatModelName(slug: string): string {
  const name = slug.includes('/') ? slug.split('/').pop()! : slug;
  return name
    .toLowerCase()
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function markdownToHtml(
  md: string,
  textPrimary: string,
  textSecondary: string,
): string {
  const lines = md.split('\n');
  const result: string[] = [];
  let inList = false;
  let listItems: string[] = [];

  const closeList = () => {
    if (inList) {
      result.push(
        `<ul style="margin:6px 0 8px 0;padding-left:18px;">${listItems.join('')}</ul>`,
      );
      listItems = [];
      inList = false;
    }
  };

  const inline = (text: string): string => {
    text = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    text = text.replace(
      /`([^`]+)`/g,
      `<code style="font-family:monospace;font-size:12px;background:#f4f4f5;padding:1px 4px;border-radius:3px;color:${textPrimary};">$1</code>`,
    );
    text = text.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      `<a href="$2" style="color:#2563eb;text-decoration:underline;">$1</a>`,
    );
    return text;
  };

  for (const line of lines) {
    const h1 = line.match(/^# (.+)/);
    const h2 = line.match(/^## (.+)/);
    const h3 = line.match(/^### (.+)/);
    const li = line.match(/^[\*\-] (.+)/);

    if (h1) {
      closeList();
      result.push(
        `<p style="font-size:16px;font-weight:700;color:${textPrimary};margin:18px 0 4px;line-height:1.4;">${inline(h1[1])}</p>`,
      );
    } else if (h2) {
      closeList();
      result.push(
        `<p style="font-size:14px;font-weight:600;color:${textPrimary};margin:16px 0 4px;line-height:1.4;">${inline(h2[1])}</p>`,
      );
    } else if (h3) {
      closeList();
      result.push(
        `<p style="font-size:13px;font-weight:600;color:${textPrimary};margin:12px 0 2px;line-height:1.4;">${inline(h3[1])}</p>`,
      );
    } else if (li) {
      inList = true;
      listItems.push(
        `<li style="font-size:13px;line-height:1.7;color:${textSecondary};margin-bottom:3px;">${inline(li[1])}</li>`,
      );
    } else if (line.trim() === '') {
      closeList();
    } else {
      closeList();
      result.push(
        `<p style="font-size:13px;line-height:1.7;color:${textSecondary};margin:4px 0;">${inline(line)}</p>`,
      );
    }
  }

  closeList();
  return result.join('\n');
}

function buildHtml(
  queryText: string,
  runs: any[],
  appUrl: string | undefined,
): string {
  const font = `Inter, system-ui, -apple-system, sans-serif`;
  const bg = `#f4f4f5`;
  const surface = `#ffffff`;
  const border = `#e4e4e7`;
  const borderLight = `#f4f4f5`;
  const textPrimary = `#18181b`;
  const textSecondary = `#3f3f46`;
  const textMuted = `#71717a`;

  const runsHtml = runs
    .map((run) => {
      const evals: any[] = run.evaluations ?? [];

      const evalsHtml =
        evals.length > 0
          ? `<div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid ${border};">
          <div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:${textMuted};margin-bottom:10px;">Evaluations</div>
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            ${evals
              .map((e) => {
                const rule = e.rules;
                const color = scoreColor(e.score, rule?.type ?? 'binary');
                const badge = formatScore(e.score, rule?.type ?? 'binary');
                return `<tr>
                <td width="32" valign="top" style="padding:5px 8px 5px 0;font-size:13px;font-weight:700;color:${color};">${badge}</td>
                <td valign="top" style="padding:5px 0;border-bottom:1px solid ${borderLight};">
                  <div style="font-size:12px;font-weight:500;color:${textSecondary};">${escapeHtml(rule?.name ?? '')}</div>
                  ${e.reasoning ? `<div style="font-size:11px;color:${textMuted};margin-top:2px;">${escapeHtml(e.reasoning)}</div>` : ''}
                </td>
              </tr>`;
              })
              .join('')}
          </table>
        </div>`
          : '';

      const responseHtml = markdownToHtml(
        run.response_text ?? '',
        textPrimary,
        textSecondary,
      );

      return `<div style="margin-bottom:16px;padding:20px;background:${surface};border:1px solid ${border};border-radius:4px;">
      <div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:${textMuted};margin-bottom:14px;">${escapeHtml(formatModelName(run.model_used))}</div>
      ${evalsHtml}
      <div>${responseHtml}</div>
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

    <div style="margin-bottom:28px;">
      <span style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${textMuted};font-weight:500;">Sonde</span>
    </div>

    <div style="margin-bottom:20px;padding:20px;background:${surface};border:1px solid ${border};border-radius:4px;">
      <div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:${textMuted};margin-bottom:8px;">Prompt</div>
      <div style="font-size:15px;font-weight:500;line-height:1.55;color:${textPrimary};">${escapeHtml(queryText)}</div>
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
