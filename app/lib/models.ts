import {
  ClaudeIcon,
  DeepSeekIcon,
  GeminiIcon,
  GrokIcon,
  MetaIcon,
  MistralIcon,
  OpenAIIcon,
  PerplexityIcon,
  QwenIcon,
  XiaomiMiMoIcon,
} from '@/components/icons';
import React from 'react';
import { MODEL_FAMILIES_CONFIG, ModelVariant, ModelFamilyConfig, getModelForTier as getModelForTierConfig } from '../supabase/functions/_shared/model-config';

export type PricingTier = 'free' | 'pro' | 'enterprise';
export type { ModelVariant };

export interface ModelFamily extends ModelFamilyConfig {
  icon: React.ElementType;
}

const ICONS: Record<string, React.ElementType> = {
  anthropic: ClaudeIcon,
  openai: OpenAIIcon,
  google: GeminiIcon,
  xai: GrokIcon,
  mistral: MistralIcon,
  qwen: QwenIcon,
  deepseek: DeepSeekIcon,
  xiaomi: XiaomiMiMoIcon,
  perplexity: PerplexityIcon,
  llama: MetaIcon,
};

export const MODEL_FAMILIES: ModelFamily[] = MODEL_FAMILIES_CONFIG.map(config => ({
  ...config,
  icon: ICONS[config.id] || OpenAIIcon // Fallback icon
}));

export function getModelForTier(familyId: string, tier: string): ModelVariant {
  return getModelForTierConfig(familyId, tier);
}

// Keep backward compatibility for existing imports
export interface Model {
  id: string;
  name: string;
  provider: string;
  icon: React.ElementType;
}

// Flatten the families to get a list of all possible models for search/display if needed
export const MODELS: Model[] = MODEL_FAMILIES.flatMap((family) => [
  { ...family.plans.free, provider: family.provider, icon: family.icon },
  { ...family.plans.pro, provider: family.provider, icon: family.icon },
  { ...family.plans.enterprise, provider: family.provider, icon: family.icon },
]).filter(
  (model, index, self) => index === self.findIndex((m) => m.id === model.id)
);

export const MODELS_BY_ID = MODELS.reduce((acc, model) => {
  acc[model.id] = model;
  return acc;
}, {} as Record<string, Model>);