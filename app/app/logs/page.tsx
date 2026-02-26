// app/logs/page.tsx
'use client';

import { useSupabase } from '@/components/auth-provider';
import { PageHeader } from '@/components/page-header';
import { format } from 'date-fns';
import { Globe } from 'lucide-react';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
    <div className="space-y-6">
      <PageHeader title="System Logs" />
      <div className="lg:grid lg:grid-cols-2 lg:gap-6">
        {/* Runs List */}
        <div className="space-y-2 lg:max-h-[800px] lg:overflow-y-auto">
          <h2 className="text-xl font-semibold mb-4 text-text-primary">
            Recent Runs
          </h2>
          <div className="space-y-2">
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
        <div className="hidden lg:block">
          <h2 className="text-xl font-semibold mb-4 text-text-primary">
            Details
          </h2>
          {selectedRun ? (
            <div className="p-6 border border-border-subtle rounded-sm bg-surface space-y-6 max-h-[800px] overflow-y-auto">
              <div>
                <div className="text-sm text-text-secondary">Model</div>
                <div className="font-medium text-text-primary">
                  {selectedRun.model_used}
                </div>
              </div>

              <div>
                <div className="text-sm text-text-secondary">Query</div>
                <div className="mt-1 text-text-primary">
                  {selectedRun.prompts.query_text}
                </div>
              </div>

              <div>
                <div className="text-sm text-text-secondary">Response</div>
                <div className="mt-1 p-3 bg-canvas border border-border-subtle rounded-sm text-sm max-h-[300px] overflow-y-auto text-text-primary prose max-w-none dark:prose-invert">
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
                  <div>
                    <div className="text-sm text-text-secondary mb-2">
                      Evaluations
                    </div>
                    <div className="space-y-3">
                      {selectedRun.evaluations.map(
                        (evaluation: any, idx: number) => (
                          <div
                            key={idx}
                            className="p-3 border border-border-subtle rounded-sm bg-canvas"
                          >
                            <div className="flex justify-between mb-1">
                              <span className="font-medium text-text-primary">
                                {evaluation.rules.name}
                              </span>
                              <span
                                className={`font-semibold font-mono ${getScoreColor(
                                  evaluation.score,
                                  evaluation.rules.type
                                )}`}
                              >
                                {evaluation.rules.type === 'ranking' &&
                                evaluation.score > 0
                                  ? `Position #${evaluation.score}`
                                  : `Score: ${evaluation.score}`}
                              </span>
                            </div>
                            {evaluation.reasoning && (
                              <div className="text-sm text-text-secondary">
                                {evaluation.reasoning}
                              </div>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}

              <div className="pt-4 border-t border-border-subtle space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Tokens (in/out):</span>
                  <span className="font-mono text-text-primary">
                    {selectedRun.token_usage_input}/
                    {selectedRun.token_usage_output}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-text-secondary">Executed:</span>
                  <span className="font-mono text-text-primary">
                    {format(new Date(selectedRun.executed_at), 'PPpp')}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 border border-border-subtle rounded-sm bg-surface text-center text-text-muted">
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
                <div>
                  <span className="text-text-secondary">Model: </span>
                  <span className="font-medium text-text-primary">{selectedRun.model_used}</span>
                </div>

                <div>
                  <span className="text-text-secondary">Query: </span>
                  <span className="text-text-primary">{selectedRun.prompts.query_text}</span>
                </div>

                <div className="pt-2">
                  <span className="text-text-secondary block mb-1">Response:</span>
                  <div className="p-3 bg-canvas border border-border-subtle rounded-sm text-text-primary prose max-w-none dark:prose-invert text-sm max-h-64 overflow-y-auto">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {selectedRun.response_text || 'No response available'}
                    </ReactMarkdown>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border-subtle">
                  <div>
                    <span className="text-text-secondary">Tokens: </span>
                    <span className="font-mono text-text-primary">
                      {selectedRun.token_usage_input}/{selectedRun.token_usage_output}
                    </span>
                  </div>
                  <div>
                    <span className="text-text-secondary">Executed: </span>
                    <span className="font-mono text-text-primary">
                      {format(new Date(selectedRun.executed_at), 'PPpp')}
                    </span>
                  </div>
                </div>

                {/* Evaluations on mobile */}
                {selectedRun.evaluations && selectedRun.evaluations.length > 0 && (
                  <div className="pt-2 border-t border-border-subtle">
                    <span className="text-text-secondary block mb-2">Evaluations:</span>
                    <div className="space-y-2">
                      {selectedRun.evaluations.map((evaluation: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center p-2 bg-surface-muted rounded">
                          <span className="text-text-primary">
                            {evaluation.rules.name}:
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
