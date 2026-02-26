'use client';

import { useSupabase } from '@/components/auth-provider';
import { CronScheduler } from '@/components/cron-scheduler';
import { ModelFamilySelector } from '@/components/model-family-selector';
import { PageHeader } from '@/components/page-header';
import { useToast } from '@/components/providers/toast-provider';
import { Button } from '@/components/ui/button';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { MODEL_FAMILIES, getModelForTier } from '@/lib/models';
import { getPlanLimits } from '@/lib/plans';
import { RULE_TYPES, RULE_TYPES_BY_ID } from '@/lib/rules';
import { useSubscription } from '@/lib/use-subscription';
import { estimateMonthlyRuns, generateAlignedCron } from '@/lib/utils';
import { Check, Plus, Trash2, X } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function EditPrompt() {
  const router = useRouter();
  const { id } = useParams();
  const { supabase, user } = useSupabase();
  const { plan } = useSubscription();

  const [queryText, setQueryText] = useState('');
  const [scheduleCron, setScheduleCron] = useState(() =>
    generateAlignedCron('monthly')
  );
  const [selectedFamilies, setSelectedFamilies] = useState<
    Record<string, boolean>
  >({});
  const [webSearch, setWebSearch] = useState<Record<string, boolean>>({});
  const [rules, setRules] = useState<
    Array<{
      id?: string;
      name: string;
      description: string;
      type: string;
    }>
  >([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const { success, error: showError } = useToast();

  useEffect(() => {
    async function loadData() {
      if (!user || !id) return;

      try {
        // Fetch prompt
        const { data: prompt, error: promptError } = await supabase
          .from('prompts')
          .select('*, rules(*)')
          .eq('id', id)
          .eq('user_id', user.id)
          .single();

        if (promptError) throw promptError;
        if (!prompt) throw new Error('Prompt not found');

        setQueryText(prompt.query_text);
        // Only override the default if a schedule actually exists in the DB
        if (prompt.schedule_cron) {
          setScheduleCron(prompt.schedule_cron);
        }

        // Restore models and web search settings by mapping back to families
        const families: Record<string, boolean> = {};
        const search: Record<string, boolean> = {};

        if (Array.isArray(prompt.target_config)) {
          prompt.target_config.forEach((config: any) => {
            // Find which family this model belongs to
            const family = MODEL_FAMILIES.find(
              (f) =>
                f.plans.free.id === config.model ||
                f.plans.pro.id === config.model ||
                f.plans.enterprise.id === config.model
            );

            if (family) {
              families[family.id] = true;
              if (config.use_search) {
                search[family.id] = true;
              }
            } else {
              // Fallback: If model ID doesn't match known families (legacy),
              // we might lose it or need to handle it. For now, we only support
              // the defined families.
              console.warn(
                `Model ${config.model} not found in defined families`
              );
            }
          });
        }
        setSelectedFamilies(families);
        setWebSearch(search);

        // Restore rules
        if (prompt.rules && Array.isArray(prompt.rules)) {
          setRules(
            prompt.rules.map((r: any) => ({
              id: r.id,
              name: r.name,
              description: r.description,
              type: r.type,
            }))
          );
        } else {
          setRules([]);
        }
      } catch (err) {
        console.error('Error loading prompt:', err);
        showError('Failed to load prompt');
        router.push('/prompts');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [user, id, supabase, router]);

  function toggleFamily(familyId: string) {
    const isSelecting = !selectedFamilies[familyId];

    // For free users: single selection only
    if (plan === 'free') {
      if (isSelecting) {
        // If selecting a new family, deselect all others first
        const newSelections: Record<string, boolean> = {};
        const newWebSearch: Record<string, boolean> = {};
        MODEL_FAMILIES.forEach((family) => {
          newSelections[family.id] = family.id === familyId;
          newWebSearch[family.id] = family.id === familyId;
        });
        setSelectedFamilies(newSelections);
        setWebSearch(newWebSearch);
      } else {
        // If deselecting the only selected family, that's fine
        setSelectedFamilies((prev) => ({
          ...prev,
          [familyId]: isSelecting,
        }));
        setWebSearch((prev) => ({
          ...prev,
          [familyId]: false,
        }));
      }
    } else {
      // For pro/enterprise users: normal multi-selection
      setSelectedFamilies((prev) => ({
        ...prev,
        [familyId]: isSelecting,
      }));
      setWebSearch((prev) => ({
        ...prev,
        [familyId]: isSelecting,
      }));
    }
  }

  function toggleWebSearch(familyId: string) {
    setWebSearch((prev) => ({
      ...prev,
      [familyId]: !prev[familyId],
    }));
  }

  function addRule() {
    setRules([
      ...rules,
      { name: '', description: '', type: 'ranking', id: undefined },
    ]);
  }

  function updateRule(index: number, field: string, value: string) {
    const newRules = [...rules];
    newRules[index] = { ...newRules[index], [field]: value };
    setRules(newRules);
  }

  function removeRule(index: number) {
    setRules(rules.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      if (!user) throw new Error('Not authenticated');

      // Check tier limits
      const newPromptCost = estimateMonthlyRuns(scheduleCron);
      const limit = getPlanLimits(plan).monthly_credits;

      // Fetch existing usage (excluding current prompt)
      const { data: existingPrompts } = await supabase
        .from('prompts')
        .select('schedule_cron')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .neq('id', id);

      const currentUsage =
        existingPrompts?.reduce(
          (acc, p) => acc + estimateMonthlyRuns(p.schedule_cron || ''),
          0
        ) || 0;

      if (currentUsage + newPromptCost > limit) {
        showError(
          `Insufficient credits. This schedule requires ${newPromptCost} credits/month, but you only have ${Math.max(
            0,
            limit - currentUsage
          )} left in your ${plan} plan.`
        );
        setSaving(false);
        return;
      }

      // Build target config
      const targetConfig = Object.entries(selectedFamilies)
        .filter(([_, selected]) => selected)
        .map(([familyId]) => {
          const resolvedModel = getModelForTier(familyId, plan);
          return {
            model: resolvedModel.id,
            use_search: webSearch[familyId] || false,
          };
        });

      if (targetConfig.length === 0) {
        showError('Please select at least one model family');
        setSaving(false);
        return;
      }

      // Update prompt
      const { error: promptError } = await supabase
        .from('prompts')
        .update({
          query_text: queryText,
          schedule_cron: scheduleCron || null,
          target_config: targetConfig,
        })
        .eq('id', id)
        .eq('user_id', user.id);

      if (promptError) throw promptError;

      // Handle rules update (logic remains same)
      const { data: currentRules } = await supabase
        .from('rules')
        .select('id')
        .eq('prompt_id', id);

      const currentRuleIds = new Set(currentRules?.map((r) => r.id));
      const newRuleIds = new Set(rules.map((r) => r.id).filter(Boolean));

      const rulesToDelete = Array.from(currentRuleIds).filter(
        (rid) => !newRuleIds.has(rid)
      );

      if (rulesToDelete.length > 0) {
        await supabase.from('rules').delete().in('id', rulesToDelete);
      }

      const rulesWithId = rules.filter((r) => r.name && r.description && r.id);
      const rulesWithoutId = rules.filter(
        (r) => r.name && r.description && !r.id
      );

      if (rulesWithId.length > 0) {
        const { error: updateError } = await supabase.from('rules').upsert(
          rulesWithId.map((r) => ({
            id: r.id,
            prompt_id: id,
            name: r.name,
            description: r.description,
            type: r.type,
          }))
        );
        if (updateError) throw updateError;
      }

      if (rulesWithoutId.length > 0) {
        const { error: insertError } = await supabase.from('rules').insert(
          rulesWithoutId.map((r) => ({
            prompt_id: id,
            name: r.name,
            description: r.description,
            type: r.type,
          }))
        );
        if (insertError) throw insertError;
      }

      router.push('/prompts');
      router.refresh();
    } catch (error) {
      console.error('Error updating prompt:', error);
      showError('Failed to update prompt');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-text-secondary">Loading...</div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader title="Edit Prompt" />

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Query */}
        <div className="p-5 border border-border-subtle rounded-sm bg-surface space-y-4">
          <h2 className="text-xl font-semibold text-text-primary flex items-center">
            Question
            <InfoTooltip content="Enter the question you expect users to ask an LLM. We will monitor the answers provided by different models to this question over time." />
          </h2>
          <textarea
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="What are the best open source CRM tools?"
            className="w-full px-4 py-3 bg-canvas border border-border-strong text-text-primary placeholder:text-text-muted rounded-sm min-h-[110px] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary font-mono text-sm"
            required
          />
          <div>
            <label className="block text-xs uppercase tracking-wide text-text-secondary mb-2">
              Schedule
            </label>
            <CronScheduler
              value={scheduleCron}
              onChange={setScheduleCron}
              plan={plan}
            />
          </div>
        </div>

        {/* Models */}
        <div className="p-5 border border-border-subtle rounded-sm bg-surface space-y-4">
          <h2 className="text-xl font-semibold text-text-primary flex items-center">
            Models
            {plan === 'free' && (
              <InfoTooltip
                content="Free plan allows selecting only one model. Upgrade to Pro to compare multiple models."
                className="ml-2"
              />
            )}
          </h2>
          <ModelFamilySelector
            plan={plan}
            selectedFamilies={selectedFamilies}
            webSearch={webSearch}
            onToggleFamily={toggleFamily}
            onToggleWebSearch={toggleWebSearch}
            maxSelections={2}
            showToast={showError}
          />
        </div>

        {/* Rules */}
        <div className="p-5 border border-border-subtle rounded-sm bg-surface space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-text-primary">
              Scoring Rules
            </h2>
            <Button type="button" onClick={addRule} variant="primary" size="sm">
              <Plus size={16} />
              Add Rule
            </Button>
          </div>

          <div className="space-y-4">
            {rules.map((rule, index) => (
              <div
                key={index}
                className="p-4 border border-border-subtle rounded-sm space-y-3 bg-canvas"
              >
                <div className="flex justify-between">
                  <input
                    type="text"
                    value={rule.name}
                    onChange={(e) => updateRule(index, 'name', e.target.value)}
                    placeholder="Rule name (e.g., 'Brand Ranking')"
                    className="flex-1 px-3 py-2 bg-surface border border-border-strong text-text-primary placeholder:text-text-muted rounded-sm mr-2 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary text-sm"
                  />
                  <select
                    value={rule.type}
                    onChange={(e) => updateRule(index, 'type', e.target.value)}
                    className="px-3 py-2 bg-surface border border-border-strong text-text-primary rounded-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary text-sm"
                  >
                    {RULE_TYPES.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                  {/* Allow removing any rule. If it had an ID, it will be deleted on save. */}
                  <Button
                    type="button"
                    onClick={() => removeRule(index)}
                    variant="danger"
                    size="sm"
                    className="ml-2"
                  >
                    <Trash2 size={16} />
                    Remove
                  </Button>
                </div>
                <textarea
                  value={rule.description}
                  onChange={(e) =>
                    updateRule(index, 'description', e.target.value)
                  }
                  placeholder={
                    RULE_TYPES_BY_ID[rule.type]?.hint ||
                    'Describe what to evaluate...'
                  }
                  className="w-full px-3 py-2 bg-surface border border-border-strong text-text-primary placeholder:text-text-muted rounded-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary text-sm"
                  rows={2}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Submit */}
        <div className="flex gap-4">
          <Button
            type="submit"
            disabled={saving}
            variant="primary"
            size="lg"
            className="w-full md:w-auto"
          >
            <Check size={16} />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
          <Button
            type="button"
            onClick={() => router.push('/prompts')}
            variant="secondary"
            size="lg"
            className="w-full md:w-auto"
          >
            <X size={16} />
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
