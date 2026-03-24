// app/prompts/page.tsx
'use client';

import { useSupabase } from '@/components/auth-provider';
import { getHumanReadableCron } from '@/components/cron-scheduler';
import { useToast } from '@/components/providers/toast-provider';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { MODELS_BY_ID } from '@/lib/models';
import { ruleTypeColor } from '@/lib/rules';
import {
  ChevronDown,
  ChevronUp,
  Edit2,
  Globe,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export default function Prompts() {
  const [prompts, setPrompts] = useState<any[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [executingPromptId, setExecutingPromptId] = useState<string | null>(null);
  const [confirmRunPrompt, setConfirmRunPrompt] = useState<any | null>(null);
  const confirmCancelRef = useRef<HTMLButtonElement>(null);
  const { supabase, user } = useSupabase();
  const { success, error: showError } = useToast();

  useEffect(() => {
    loadPrompts();
  }, [user]);

  async function loadPrompts() {
    if (!user) return;

    const { data } = await supabase
      .from('prompts')
      .select('*, rules(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    setPrompts(data || []);
  }

  async function toggleActive(id: string, currentState: boolean) {
    await supabase
      .from('prompts')
      .update({ is_active: !currentState })
      .eq('id', id);
    loadPrompts();
  }

  async function runNow(id: string) {
    setExecutingPromptId(id);
    
    try {
      // First check if user has sufficient credits
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('credits_balance')
        .eq('id', user.id)
        .single();
        
      if (profileError) {
        throw new Error('Failed to check credits: ' + profileError.message);
      }
      
      if (!profile || profile.credits_balance <= 0) {
        throw new Error(
          'Insufficient credits. Please upgrade your plan or wait for your next monthly credit reset.',
        );
      }

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ prompt_id: id }),
      });

      if (res.ok) {
        success('Execution started! Results will be available in a few minutes.');
      } else {
        const errorData = await res.json();
        showError(`Execution failed: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      showError(`Execution failed: ${error instanceof Error ? error.message : 'Network error'}`);
    } finally {
      setExecutingPromptId(null);
    }
  }

  async function deletePrompt(id: string) {
    if (!confirm('Are you sure you want to delete this prompt?')) return;

    const { error } = await supabase.from('prompts').delete().eq('id', id);

    if (error) {
      console.error('Error deleting prompt:', error);
      showError('Failed to delete prompt');
    } else {
      success('Prompt deleted successfully');
      loadPrompts();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end items-center">
        <Button href="/prompts/new">
          <Plus size={16} />
          Create Prompt
        </Button>
      </div>

      <div className="space-y-4">
        {prompts.map((prompt) => (
          <div
            key={prompt.id}
            className="p-5 border border-border-subtle rounded-sm bg-surface transition-all"
          >
            <div className="flex justify-between items-start gap-4">
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-text-primary truncate">
                  {prompt.query_text}
                </h3>
                <div className="mt-2 text-sm text-text-secondary flex items-center flex-wrap gap-y-1">
                  <span className="font-mono bg-surface-muted px-2 py-0.5 rounded text-xs">
                    Models: {prompt.target_config?.length || 0}
                  </span>
                  <span className="mx-2 text-border-subtle">•</span>
                  <span className="font-mono bg-surface-muted px-2 py-0.5 rounded text-xs">
                    {getHumanReadableCron(prompt.schedule_cron)}
                  </span>
                  <span className="mx-2 text-border-subtle">•</span>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      prompt.is_active
                        ? 'bg-success/10 text-success'
                        : 'bg-text-muted/10 text-text-muted'
                    }`}
                  >
                    {prompt.is_active ? 'Active' : 'Paused'}
                  </span>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  onClick={() => setConfirmRunPrompt(prompt)}
                  variant="secondary"
                  size="sm"
                  title="Run Now"
                  disabled={executingPromptId === prompt.id}
                >
                  <RefreshCw size={16} className={executingPromptId === prompt.id ? 'animate-spin' : ''} />
                  <span className="hidden sm:inline">Run now</span>
                </Button>
                <Button
                  onClick={() => toggleActive(prompt.id, prompt.is_active)}
                  variant="secondary"
                  size="sm"
                  title={prompt.is_active ? 'Pause' : 'Activate'}
                >
                  {prompt.is_active ? <Pause size={16} /> : <Play size={16} />}
                  <span className="hidden sm:inline">
                    {prompt.is_active ? 'Pause' : 'Activate'}
                  </span>
                </Button>
                <Button
                  onClick={() =>
                    setExpandedId(expandedId === prompt.id ? null : prompt.id)
                  }
                  variant="secondary"
                  size="icon"
                  title="Details"
                >
                  {expandedId === prompt.id ? (
                    <ChevronUp size={16} />
                  ) : (
                    <ChevronDown size={16} />
                  )}
                </Button>
              </div>
            </div>

            {expandedId === prompt.id && (
              <div className="mt-4 pt-4 border-t border-border-subtle animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-text-muted mb-2">Full Query</p>
                      <div className="p-3 bg-canvas border border-border-subtle rounded-sm text-sm text-text-primary whitespace-pre-wrap max-h-40 overflow-y-auto">
                        {prompt.query_text}
                      </div>
                    </div>
                    <div className="mt-auto flex justify-between items-center pt-2 border-t border-border-subtle">
                      <p className="text-xs uppercase tracking-wider text-text-muted">Created</p>
                      <p className="text-xs font-mono text-text-secondary">
                        {new Date(prompt.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-text-muted mb-2">Target Models</p>
                      <div className="space-y-1.5">
                        {prompt.target_config?.map((conf: any, idx: number) => {
                          const model = MODELS_BY_ID[conf.model];
                          return (
                            <div
                              key={idx}
                              className="flex items-center justify-between px-3 py-2 bg-canvas border border-border-subtle rounded-sm"
                            >
                              <span className="flex items-center gap-2 text-sm text-text-primary">
                                {model ? <model.icon size={14} /> : null}
                                {model?.name || conf.model}
                              </span>
                              {conf.use_search && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-surface text-text-muted flex items-center gap-1.5 border border-border-subtle">
                                  <Globe size={10} />
                                  Search
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider text-text-muted mb-2">Rules</p>
                      {prompt.rules && prompt.rules.length > 0 ? (
                        <div className="space-y-1.5">
                          {prompt.rules.map((rule: any) => (
                            <div
                              key={rule.id}
                              className="px-3 py-2 bg-canvas border border-border-subtle rounded-sm"
                            >
                              <span className="flex items-center gap-2 text-sm text-text-primary">
                                <span
                                  className="w-1.5 h-1.5 rounded-full shrink-0"
                                  style={{ backgroundColor: ruleTypeColor(rule.type) }}
                                />
                                {rule.name}
                              </span>
                              {rule.description && (
                                <p className="text-xs text-text-muted mt-1 ml-3.5">
                                  {rule.description}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-text-muted italic">No rules configured.</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex justify-end pt-4 border-t border-border-dashed gap-3">
                  <Button
                    href={`/prompts/edit/${prompt.id}`}
                    variant="secondary"
                    size="md"
                  >
                    <Edit2 size={16} />
                    Edit Prompt
                  </Button>
                  <Button
                    onClick={() => deletePrompt(prompt.id)}
                    variant="danger"
                    size="md"
                  >
                    <Trash2 size={16} />
                    Delete Prompt
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}

        {prompts.length === 0 && (
          <div className="text-center py-12 text-text-muted border border-border-subtle rounded-sm bg-surface">
            No prompts yet. Create your first one to get started!
          </div>
        )}
      </div>

      {confirmRunPrompt && (
        <Modal
          level="warning"
          title="Run prompt manually?"
          actions={
            <>
              <Button
                ref={confirmCancelRef}
                variant="secondary"
                size="md"
                onClick={() => setConfirmRunPrompt(null)}
              >
                Keep schedule only
              </Button>
              <Button
                variant="primary"
                size="md"
                disabled={executingPromptId === confirmRunPrompt.id}
                onClick={() => {
                  const id = confirmRunPrompt.id;
                  setConfirmRunPrompt(null);
                  runNow(id);
                }}
              >
                <RefreshCw size={14} className={executingPromptId === confirmRunPrompt.id ? 'animate-spin' : ''} />
                Run now
              </Button>
            </>
          }
        >
          <p>
            Running this prompt manually will deduct{' '}
            <span className="font-medium text-text-primary">1 additional credit</span> from your balance.
          </p>
          {confirmRunPrompt.is_active && (
            <p>
              This prompt is already{' '}
              <span className="font-medium text-text-primary">active</span> and running automatically on a{' '}
              <span className="font-medium text-text-primary">{getHumanReadableCron(confirmRunPrompt.schedule_cron)}</span> schedule.
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}
