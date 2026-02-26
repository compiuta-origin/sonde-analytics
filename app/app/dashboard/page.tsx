// app/dashboard/page.tsx
'use client';

import { useSupabase } from '@/components/auth-provider';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { Tooltip } from '@/components/ui/tooltip';
import { MODELS } from '@/lib/models';
import { Evaluation, Prompt, Rule, Run } from '@/lib/types';
import { cn } from '@/lib/utils';
import { format, startOfDay, subDays } from 'date-fns';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';

type Period = 'today' | '7d' | '30d' | '12m' | 'all';

export default function Dashboard() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState<string>('');
  const [rules, setRules] = useState<Rule[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('7d');
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>(
    MODELS.map((m) => m.id)
  );
  const [visibleRules, setVisibleRules] = useState<Record<string, boolean>>({});

  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { supabase, user } = useSupabase();
  const searchParams =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search)
      : null;
  const showSuccess = searchParams?.get('success') === 'true';

  // Fetch Prompts
  useEffect(() => {
    async function fetchPrompts() {
      if (!user) {
        setIsLoading(false);
        return;
      }
      const { data: promptsData } = await supabase
        .from('prompts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (promptsData) {
        setPrompts(promptsData);
        if (promptsData.length > 0 && !selectedPromptId) {
          setSelectedPromptId(promptsData[0].id);
        } else if (promptsData.length === 0) {
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
      }
    }
    fetchPrompts();
  }, [user, supabase, selectedPromptId]);

  // Fetch Rules when prompt changes
  useEffect(() => {
    async function fetchRules() {
      if (!selectedPromptId) return;
      const { data: rulesData } = await supabase
        .from('rules')
        .select('*')
        .eq('prompt_id', selectedPromptId);

      if (rulesData) {
        setRules(rulesData);
        // Initialize visibility for new rules
        setVisibleRules((prev) => {
          const next = { ...prev };
          rulesData.forEach((r) => {
            if (next[r.id] === undefined) next[r.id] = true;
          });
          return next;
        });
      }
    }
    fetchRules();
  }, [selectedPromptId, supabase]);

  // Fetch and Transform Data
  useEffect(() => {
    async function fetchData() {
      if (!selectedPromptId || selectedModelIds.length === 0) {
        setData([]);
        if (selectedPromptId) setIsLoading(false);
        return;
      }

      setIsLoading(true);
      let startDate = subDays(startOfDay(new Date()), 7);
      if (selectedPeriod === 'today') startDate = startOfDay(new Date());
      else if (selectedPeriod === '30d')
        startDate = subDays(startOfDay(new Date()), 30);
      else if (selectedPeriod === '12m')
        startDate = subDays(startOfDay(new Date()), 365);
      else if (selectedPeriod === 'all') startDate = new Date(0);

      const { data: runsData } = await supabase
        .from('runs')
        .select(
          `
          *,
          evaluations(*, rules(*))
        `
        )
        .eq('prompt_id', selectedPromptId)
        .in('model_used', selectedModelIds)
        .gte('executed_at', startDate.toISOString())
        .order('executed_at', { ascending: true });

      if (runsData) {
        const runsWithEvaluations = runsData.filter(
          (run: Run & { evaluations: Evaluation[] }) =>
            run.evaluations && run.evaluations.length > 0
        );

        const formattedData = runsWithEvaluations.map(
          // rules have been included
          (run: Run & { evaluations: (Evaluation & { rules: any })[] }) => {
            const date = new Date(run.executed_at);
            const dataPoint: any = {
              timestamp: run.executed_at,
              date: format(
                date,
                selectedPeriod === 'today' ? 'HH:mm' : 'MMM dd HH:mm'
              ),
            };

            run.evaluations.forEach((evalItem) => {
              // For ranking rules, if score is 0, it means "not in top positions"
              // Set to null so it doesn't appear at the top of the inverted chart
              const ruleType = evalItem.rules?.type; // Use the included rules data
              if (ruleType === 'ranking' && evalItem.score === 0) {
                dataPoint[evalItem.rule_id] = null;
              } else {
                dataPoint[evalItem.rule_id] = evalItem.score;
              }
            });

            return dataPoint;
          }
        );
        setData(formattedData);
      }
      setIsLoading(false);
    }
    fetchData();
  }, [selectedPromptId, selectedPeriod, selectedModelIds, supabase]);

  const toggleModel = (id: string) => {
    setSelectedModelIds((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  // Calculate stats from current data
  const stats = useMemo(() => {
    if (data.length === 0 || rules.length === 0)
      return { avgRank: 0, shareOfVoice: 0, totalRuns: 0 };

    const rankingRule = rules.find((r) => r.type === 'ranking');
    if (!rankingRule)
      return { avgRank: 0, shareOfVoice: 0, totalRuns: data.length };

    const rankings = data
      .map((d) => d[rankingRule.id])
      .filter((v) => v !== undefined && v !== null);

    if (rankings.length === 0)
      return { avgRank: 0, shareOfVoice: 0, totalRuns: data.length };

    const avgRank = rankings.reduce((a, b) => a + b, 0) / rankings.length;
    const top3 = rankings.filter((r) => r <= 3).length;
    const shareOfVoice = (top3 / rankings.length) * 100;

    return {
      avgRank,
      shareOfVoice,
      totalRuns: data.length,
    };
  }, [data, rules]);

  const toggleRule = (id: string) => {
    setVisibleRules((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-8">
      <PageHeader title="Signal monitor" />

      {showSuccess && (
        <div className="p-4 rounded-sm border border-primary/50 bg-primary/10 text-primary flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-500">
          <Check size={20} />
          <div>
            <p className="font-bold">Upgrade successful!</p>
            <p className="text-sm opacity-90">
              Welcome to Sonde Pro. Your new limits are now active.
            </p>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid md:grid-cols-3 gap-6">
        <div className="p-5 border border-border-subtle rounded-sm bg-surface">
          <div className="text-xs uppercase tracking-wide text-text-secondary flex items-center">
            Average Rank
            <InfoTooltip content="The average position of your brand across all successful runs. Closer to #1 is better." />
          </div>
          <div className="text-3xl font-mono font-normal mt-2 text-text-primary">
            {stats.avgRank > 0 ? stats.avgRank.toFixed(1) : 'N/A'}
          </div>
        </div>
        <div className="p-5 border border-border-subtle rounded-sm bg-surface">
          <div className="text-xs uppercase tracking-wide text-text-secondary flex items-center">
            Share of Voice
            <InfoTooltip content="Percentage of runs where your brand appeared in the top 3 positions. Higher is better." />
          </div>
          <div className="text-3xl font-mono font-normal mt-2 text-text-primary">
            {stats.shareOfVoice.toFixed(0)}%
          </div>
        </div>
        <div className="p-5 border border-border-subtle rounded-sm bg-surface">
          <div className="text-xs uppercase tracking-wide text-text-secondary flex items-center">
            Total Runs
            <InfoTooltip content="Total number of automated checks performed for the selected prompt and period." />
          </div>
          <div className="text-3xl font-mono font-normal mt-2 text-text-primary">
            {stats.totalRuns}
          </div>
        </div>
      </div>

      {/* Main Chart Card */}
      <div className="border border-border-subtle rounded-sm bg-surface overflow-hidden">
        <div className="p-5 border-b border-border-subtle bg-surface-muted/50">
          <div className="text-xs uppercase tracking-wide text-text-secondary mb-4">
            Performance Over Time
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Prompt Selector */}
              <select
                value={selectedPromptId}
                onChange={(e) => setSelectedPromptId(e.target.value)}
                className="bg-canvas border border-border-strong text-text-primary text-xs rounded-sm px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary min-w-[200px]"
              >
                {prompts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.query_text}
                  </option>
                ))}
              </select>

              {/* Period Selector */}
              <div className="flex bg-canvas border border-border-strong rounded-sm p-0.5">
                {(['today', '7d', '30d', '12m', 'all'] as Period[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setSelectedPeriod(p)}
                    className={cn(
                      'px-3 py-1 text-[10px] uppercase font-bold tracking-tight rounded-sm transition-all cursor-pointer',
                      selectedPeriod === p
                        ? 'text-[var(--brand-amber)] font-medium'
                        : 'text-text-muted hover:text-text-primary'
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Rule Visibility Toggles */}
            <div className="flex flex-wrap gap-2 md:justify-end items-center">
              {rules.map((rule) => (
                <button
                  key={rule.id}
                  onClick={() => toggleRule(rule.id)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-sm border text-[11px] font-medium transition-all cursor-pointer',
                    visibleRules[rule.id]
                      ? 'bg-surface border-primary text-text-primary shadow-[0_0_10px_rgba(245,158,11,0.1)]'
                      : 'bg-canvas border-border-subtle text-text-muted grayscale opacity-50 hover:opacity-100'
                  )}
                >
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor:
                        rule.type === 'ranking'
                          ? '#f59e0b'
                          : rule.type === 'sentiment'
                          ? '#3b82f6'
                          : '#10b981',
                    }}
                  />
                  {rule.name}
                  {visibleRules[rule.id] && (
                    <Check size={10} className="ml-1 text-primary" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6 h-[450px] flex items-center justify-center">
          {isLoading ? (
            <div className="text-text-muted font-mono text-sm animate-pulse">
              Loading data...
            </div>
          ) : data.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ left: -20, right: 10 }}>
                <CartesianGrid
                  stroke="#27272a"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  stroke="#52525b"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  dy={10}
                />

                {/* Y Axis 1: Ranking */}
                <YAxis
                  yAxisId="ranking"
                  reversed
                  domain={[1, 10]}
                  tick={false}
                  tickLine={false}
                  axisLine={false}
                  hide={
                    !rules.some(
                      (r) => r.type === 'ranking' && visibleRules[r.id]
                    )
                  }
                  allowDataOverflow={true} // Allow values outside domain
                />

                {/* Y Axis 2: Sentiment */}
                <YAxis
                  yAxisId="sentiment"
                  orientation="right"
                  domain={[-1, 1]}
                  tick={false}
                  tickLine={false}
                  axisLine={false}
                  hide={
                    !rules.some(
                      (r) => r.type === 'sentiment' && visibleRules[r.id]
                    )
                  }
                />

                {/* Y Axis 3: Binary */}
                <YAxis
                  yAxisId="binary"
                  orientation="right"
                  domain={[0, 1]}
                  tick={false}
                  tickLine={false}
                  axisLine={false}
                  hide
                />

                <RechartsTooltip
                  contentStyle={{
                    background: '#18181b',
                    border: '1px solid #3f3f46',
                    borderRadius: 4,
                    fontSize: 12,
                    color: '#fafafa',
                  }}
                  itemStyle={{ padding: '2px 0' }}
                  shared={true}
                  formatter={(value: any, name?: string, props?: any) => {
                    const rule = rules.find((r) => r.name === name);
                    if (!rule) return [value, name];

                    if (rule.type === 'ranking') {
                      if (value === null) {
                        return ['Not in top positions', name];
                      }
                      return [`#${value}`, name];
                    }
                    if (rule.type === 'sentiment') {
                      const val = parseFloat(value);
                      return [`${val > 0 ? '+' : ''}${val.toFixed(2)}`, name!];
                    }
                    if (rule.type === 'binary') {
                      return [Number(value) === 1 ? 'Yes' : 'No', name!];
                    }
                    return [value, name!];
                  }}
                />

                {rules.map((rule) => {
                  if (!visibleRules[rule.id]) return null;

                  if (rule.type === 'ranking') {
                    return (
                      <Line
                        key={rule.id}
                        yAxisId="ranking"
                        type="monotone"
                        dataKey={rule.id}
                        stroke="#f59e0b"
                        name={rule.name}
                        strokeWidth={2}
                        dot={{
                          r: 3,
                          fill: '#f59e0b',
                          stroke: '#f59e0b',
                        }}
                        activeDot={{ r: 5, strokeWidth: 0 }}
                        connectNulls={false} // Don't connect null values with lines
                      />
                    );
                  }
                  if (rule.type === 'sentiment') {
                    return (
                      <Line
                        key={rule.id}
                        yAxisId="sentiment"
                        type="monotone"
                        dataKey={rule.id}
                        stroke="#3b82f6"
                        name={rule.name}
                        strokeWidth={2}
                        dot={{ r: 3, fill: '#3b82f6' }}
                        activeDot={{ r: 5, strokeWidth: 0 }}
                        connectNulls
                      />
                    );
                  }
                  if (rule.type === 'binary') {
                    return (
                      <Line
                        key={rule.id}
                        yAxisId="binary"
                        type="stepAfter"
                        dataKey={rule.id}
                        stroke="#10b981"
                        name={rule.name}
                        strokeWidth={2}
                        dot={{ r: 3, fill: '#10b981' }}
                        activeDot={{ r: 5, strokeWidth: 0 }}
                        connectNulls
                      />
                    );
                  }
                  return null;
                })}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center text-center space-y-6">
              <p className="text-text-secondary max-w-sm">
                Data will start appearing here as soon as the first prompt runs.
              </p>
              <Button href="/prompts" variant="primary" size="lg">
                Go to prompts
              </Button>
            </div>
          )}
        </div>

        {/* Model Filter - Centered below chart */}
        <div className="px-6 py-2 flex justify-center items-center gap-2 border-t border-border-subtle/30">
          {(() => {
            // Find the selected prompt to get its target models
            const selectedPrompt = prompts.find(
              (p) => p.id === selectedPromptId
            );
            if (!selectedPrompt || !selectedPrompt.target_config) {
              return (
                <div className="text-text-muted text-sm py-2">
                  No models configured
                </div>
              );
            }

            // Get models from the prompt's target_config
            const promptModels = selectedPrompt.target_config
              .map((config: any) => MODELS.find((m) => m.id === config.model))
              .filter((model: any) => model) as typeof MODELS;

            // If no models found, show all models (fallback)
            const modelsToShow =
              promptModels.length > 0 ? promptModels : MODELS;

            return modelsToShow.map((model) => {
              const isSelected = selectedModelIds.includes(model.id);
              return (
                <Tooltip key={model.id} content={model.name}>
                  <button
                    onClick={() => toggleModel(model.id)}
                    className={cn(
                      'p-2.5 rounded-full border transition-all duration-200 cursor-pointer',
                      isSelected
                        ? 'bg-surface border-primary text-primary shadow-[0_0_15px_rgba(245,158,11,0.15)] scale-110'
                        : 'bg-canvas border-border-subtle text-text-muted grayscale opacity-40 hover:opacity-70 hover:scale-105'
                    )}
                  >
                    <model.icon size={18} />
                  </button>
                </Tooltip>
              );
            });
          })()}
        </div>
      </div>
    </div>
  );
}
