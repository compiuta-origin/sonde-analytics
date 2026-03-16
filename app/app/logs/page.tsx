// app/logs/page.tsx
'use client';

import { useSupabase } from '@/components/auth-provider';
import { PageHeader } from '@/components/page-header';
import { MODELS_BY_ID } from '@/lib/models';
import { format } from 'date-fns';
import { Globe } from 'lucide-react';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function ruleTypeColor(type: string) {
  if (type === 'ranking') return '#f59e0b';
  if (type === 'sentiment') return '#3b82f6';
  return '#10b981';
}

export default function Logs() {
  const [runs, setRuns] = useState<any[]>([]);
  const [selectedRun, setSelectedRun] = useState<any>(null);
  const { supabase, user } = useSupabase();

  useEffect(() => {
    loadRuns();
  }, [user]);

  async function loadRuns() {
    if (!user) return;

    const { data } = await supabase
      .from('runs')
      .select(
        `
        *,
        prompts!inner(user_id, query_text),
        evaluations(score, reasoning, rules(name, type))
      `
      )
      .eq('prompts.user_id', user.id)
      .order('executed_at', { ascending: false })
      .limit(50);

    setRuns(data || []);
  }

  function getScoreColor(score: number, type: string) {
    if (type === 'binary') return score > 0 ? 'text-success' : 'text-error';
    if (type === 'ranking') {
      if (score === 0) return 'text-text-muted';
      if (score <= 3) return 'text-primary';
      if (score <= 5) return 'text-info';
      return 'text-error';
    }
    if (type === 'sentiment') {
      if (score > 0.3) return 'text-success';
      if (score < -0.3) return 'text-error';
      return 'text-text-secondary';
    }
    return '';
  }

  return (
    <div className="flex flex-col gap-6 h-full">
      <PageHeader title="System Logs" />
      <div className="flex-1 min-h-0 lg:grid lg:grid-cols-2 lg:gap-6">
        {/* Runs List */}
        <div className="flex flex-col min-h-0">
          <h2 className="text-xl font-semibold mb-4 text-text-primary shrink-0">
            Recent Runs
          </h2>
          <div className="flex-1 overflow-y-auto space-y-2">
            {runs.map((run) => (
              <div
                key={run.id}
                onClick={() => setSelectedRun(run)}
                className={`p-4 border rounded-sm cursor-pointer bg-surface hover:border-primary transition-colors ${
                  selectedRun?.id === run.id
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-border-subtle'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="text-sm font-medium text-text-primary">
                    {run.model_used.split('/')[1]}
                  </div>
                  <div className="text-xs text-text-secondary font-mono">
                    {format(new Date(run.executed_at), 'MMM dd, HH:mm')}
                  </div>
                </div>

                <div className="text-sm text-text-secondary mb-2 truncate">
                  {run.prompts.query_text}
                </div>

                <div className="flex items-center gap-2 text-xs">
                  {run.web_search_enabled && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-canvas text-text-muted flex items-center gap-1.5 border border-border-subtle">
                      <Globe size={10} />
                      Search
                    </span>
                  )}
                </div>

                {/* Scores */}
                {run.evaluations && run.evaluations.length > 0 && (
                  <div className="mt-2 flex gap-2 flex-wrap">
                    {run.evaluations.map((evaluation: any, idx: number) => (
                      <span
                        key={idx}
                        className={`text-xs font-medium font-mono ${getScoreColor(
                          evaluation.score,
                          evaluation.rules.type
                        )}`}
                      >
                        {evaluation.rules.name}:{' '}
                        {evaluation.rules.type === 'ranking' &&
                        evaluation.score > 0
                          ? `#${evaluation.score}`
                          : evaluation.score}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {runs.length === 0 && (
              <div className="text-center py-12 text-text-muted border border-border-subtle rounded-sm bg-surface">
                No runs yet. Execute a prompt to see results here!
              </div>
            )}
          </div>
        </div>

        {/* Run Details - Desktop only */}
        <div className="hidden lg:flex lg:flex-col min-h-0">
          <h2 className="text-xl font-semibold mb-4 text-text-primary shrink-0">
            Details
          </h2>
          {selectedRun ? (
            <div className="flex-1 flex flex-col p-6 border border-border-subtle rounded-sm bg-surface gap-5 min-h-0">
              {/* Query + Model — primary heading row */}
              <div className="flex items-baseline justify-between w-full gap-4 shrink-0">
                <div className="font-medium text-text-primary">{selectedRun.prompts.query_text}</div>
                <div className="flex items-center gap-1.5 text-xs text-text-muted shrink-0">
                  {(() => {
                    const model = MODELS_BY_ID[selectedRun.model_used];
                    return model ? (
                      <>
                        <model.icon size={13} />
                        <span>{model.name}</span>
                      </>
                    ) : (
                      <span>{selectedRun.model_used}</span>
                    );
                  })()}
                </div>
              </div>

              {/* Response — grows to fill available space */}
              <div className="flex-1 flex flex-col min-h-0">
                <div className="text-xs uppercase tracking-wider text-text-muted mb-2 shrink-0">Response</div>
                <div className="flex-1 overflow-y-auto p-3 bg-canvas border border-border-subtle rounded-sm text-sm text-text-primary prose max-w-none dark:prose-invert">
                  {selectedRun.response_text ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {selectedRun.response_text}
                    </ReactMarkdown>
                  ) : (
                    <span className="text-text-muted italic">No response recorded</span>
                  )}
                </div>
              </div>

              {selectedRun.evaluations &&
                selectedRun.evaluations.length > 0 && (
                  <div className="shrink-0">
                    <div className="text-xs uppercase tracking-wider text-text-muted mb-2">
                      Evaluations
                    </div>
                    <div className="space-y-2">
                      {selectedRun.evaluations.map(
                        (evaluation: any, idx: number) => (
                          <div
                            key={idx}
                            className="px-3 py-2.5 border border-border-subtle rounded-sm bg-canvas"
                          >
                            <div className="flex justify-between items-center">
                              <span className="flex items-center gap-2 text-sm text-text-primary">
                                <span
                                  className="w-1.5 h-1.5 rounded-full shrink-0"
                                  style={{ backgroundColor: ruleTypeColor(evaluation.rules.type) }}
                                />
                                {evaluation.rules.name}
                              </span>
                              <span
                                className={`text-sm font-mono tabular-nums ${getScoreColor(
                                  evaluation.score,
                                  evaluation.rules.type
                                )}`}
                              >
                                {evaluation.rules.type === 'ranking'
                                  ? evaluation.score > 0 ? `#${evaluation.score}` : '—'
                                  : evaluation.score}
                              </span>
                            </div>
                            {evaluation.reasoning && (
                              <div className="text-xs text-text-muted mt-1.5 leading-relaxed">
                                {evaluation.reasoning}
                              </div>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}

              {/* Timestamp pinned at bottom */}
              <div className="pt-4 border-t border-border-subtle shrink-0 flex justify-between items-center">
                <span className="text-xs uppercase tracking-wider text-text-muted">Executed</span>
                <span className="text-xs font-mono text-text-secondary">
                  {format(new Date(selectedRun.executed_at), 'PPpp')}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center border border-border-subtle rounded-sm bg-surface text-center text-text-muted">
              Select a run to view details
            </div>
          )}
        </div>
      </div>

      {/* Mobile Details Bottom Sheet - fixed position overlay */}
      {selectedRun && (
        <div className="lg:hidden fixed inset-0 bg-black/90 z-50 overflow-y-auto">
          <div className="fixed inset-0" onClick={() => setSelectedRun(null)} />
          <div className="relative bg-surface rounded-sm p-4 m-4 border border-border-subtle max-h-[90vh] overflow-y-auto">
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-text-primary">Run Details</h3>
                <button
                  onClick={() => setSelectedRun(null)}
                  className="text-text-secondary hover:text-text-primary transition-colors text-xl"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-4">
                  <div className="shrink-0">
                    <span className="text-text-secondary block mb-0.5">Model</span>
                    <div className="flex items-center gap-1.5 font-medium text-text-primary">
                      {(() => {
                        const model = MODELS_BY_ID[selectedRun.model_used];
                        return model ? (
                          <>
                            <model.icon size={14} />
                            <span>{model.name}</span>
                          </>
                        ) : (
                          <span>{selectedRun.model_used}</span>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-text-secondary block mb-0.5">Query</span>
                    <span className="text-text-primary">{selectedRun.prompts.query_text}</span>
                  </div>
                </div>

                <div className="pt-2">
                  <span className="text-text-secondary block mb-1">Response:</span>
                  <div className="p-3 bg-canvas border border-border-subtle rounded-sm text-text-primary prose max-w-none dark:prose-invert text-sm max-h-64 overflow-y-auto">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {selectedRun.response_text || 'No response available'}
                    </ReactMarkdown>
                  </div>
                </div>

                {/* Evaluations on mobile */}
                {selectedRun.evaluations && selectedRun.evaluations.length > 0 && (
                  <div className="pt-2 border-t border-border-subtle">
                    <span className="text-text-secondary block mb-2">Evaluations:</span>
                    <div className="space-y-2">
                      {selectedRun.evaluations.map((evaluation: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center p-2 bg-surface-muted rounded">
                          <span className="flex items-center gap-2 text-text-primary">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: ruleTypeColor(evaluation.rules.type) }}
                            />
                            {evaluation.rules.name}
                          </span>
                          <span className={`font-medium ${getScoreColor(evaluation.score, evaluation.rules.type)}`}>
                            {evaluation.rules.type === 'ranking' && evaluation.score > 0
                              ? `#${evaluation.score}`
                              : evaluation.score}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
