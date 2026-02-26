// app/prompts/new/page.tsx
'use client';

import { useSupabase } from '@/components/auth-provider';
import { CronScheduler } from '@/components/cron-scheduler';
import { ModelFamilySelector } from '@/components/model-family-selector';
import { PageHeader } from '@/components/page-header';
import { useToast } from '@/components/providers/toast-provider';
import { Button } from '@/components/ui/button';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { getModelForTier, MODEL_FAMILIES } from '@/lib/models';
import { getPlanLimits } from '@/lib/plans';
import { RULE_TYPES, RULE_TYPES_BY_ID } from '@/lib/rules';
import { useSubscription } from '@/lib/use-subscription';
import { estimateMonthlyRuns, generateAlignedCron } from '@/lib/utils';
import { Plus, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function NewPrompt() {
  const router = useRouter();
  const { supabase, user } = useSupabase();
  const { plan } = useSubscription();

  const [queryText, setQueryText] = useState('');
  const [scheduleCron, setScheduleCron] = useState(() =>
    generateAlignedCron('monthly')
  );
  const [selectedFamilies, setSelectedFamilies] = useState<
    Record<string, boolean>
  >({});
  // Tracks web search per Family ID
  const [webSearch, setWebSearch] = useState<Record<string, boolean>>({});
  const [rules, setRules] = useState<
    Array<{ name: string; description: string; type: string }>
  >([
    {
      name: 'Brand Mentioned',
      description: 'Is "YourBrand" mentioned in the response?',
      type: 'binary',
    },
  ]);
  const [saving, setSaving] = useState(false);
  const { success, error: showError } = useToast();

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
    setRules([...rules, { name: '', description: '', type: 'ranking' }]);
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

      // Fetch existing usage
      const { data: existingPrompts } = await supabase
        .from('prompts')
        .select('schedule_cron')
        .eq('user_id', user.id)
        .eq('is_active', true);

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

      // Build target config by resolving families to specific models based on tier
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

      // Create prompt
      const { data: prompt, error: promptError } = await supabase
        .from('prompts')
        .insert({
          user_id: user.id,
          query_text: queryText,
          schedule_cron: scheduleCron || null,
          target_config: targetConfig,
        })
        .select()
        .single();

      if (promptError) throw promptError;

      // Create rules
      const rulesData = rules
        .filter((r) => r.name && r.description)
        .map((r) => ({
          prompt_id: prompt.id,
          ...r,
        }));

      if (rulesData.length > 0) {
        const { error: rulesError } = await supabase
          .from('rules')
          .insert(rulesData);

        if (rulesError) throw rulesError;
      }

      success('Prompt created successfully!');
      router.push('/prompts');
    } catch (error) {
      console.error('Error creating prompt:', error);
      showError('Failed to create prompt');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader title="Create Prompt" />

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
                  {index > 0 && (
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
                  )}
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
            <Plus size={16} />
            {saving ? 'Creating...' : 'Create Prompt'}
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
