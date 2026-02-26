export type PricingTier = 'free' | 'pro' | 'enterprise';

export interface ModelVariant {
  id: string; // The actual model ID (e.g., 'openai/gpt-5.2')
  name: string; // Display name for this variant (e.g., 'GPT-5.2')
}

export interface ModelFamilyConfig {
  id: string; // Family ID (e.g., 'openai')
  name: string; // Family Display Name (e.g., 'OpenAI GPT')
  provider: string;
  description: string;
  // Preferred OpenRouter provider order for this family (first = highest priority)
  preferred_providers?: string[];
  // Map plans to specific models
  plans: {
    free: ModelVariant;
    pro: ModelVariant;
    enterprise: ModelVariant;
  };
}

export const MODEL_FAMILIES_CONFIG: ModelFamilyConfig[] = [
  {
    id: 'anthropic',
    name: 'Claude',
    provider: 'Anthropic',
    description: "Anthropic's Claude models.",
    preferred_providers: ['Anthropic'],
    plans: {
      free: { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5' },
      pro: { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6' },
      enterprise: {
        id: 'anthropic/claude-sonnet-4.6',
        name: 'Claude Sonnet 4.6',
      },
    },
  },
  {
    id: 'openai',
    name: 'GPT',
    provider: 'OpenAI',
    description: "OpenAI's flagship GPT models.",
    preferred_providers: ['OpenAI'],
    plans: {
      free: { id: 'openai/gpt-5-nano', name: 'GPT-5 Nano' },
      pro: { id: 'openai/gpt-5.2', name: 'GPT-5.2' },
      enterprise: { id: 'openai/gpt-5.2', name: 'GPT-5.2' },
    },
  },
  {
    id: 'google',
    name: 'Gemini',
    provider: 'Google',
    description: "Google's multimodal Gemini models.",
    plans: {
      free: { id: 'google/gemini-3-flash-preview', name: 'Gemini 3 Flash' },
      pro: { id: 'google/gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro' },
      enterprise: {
        id: 'google/gemini-3.1-pro-preview',
        name: 'Gemini 3.1 Pro',
      },
    },
  },
  {
    id: 'xai',
    name: 'Grok',
    provider: 'xAI',
    description: "xAI's Grok models with real-time knowledge.",
    plans: {
      free: { id: 'x-ai/grok-4.1-fast', name: 'Grok 4.1 Fast' },
      pro: { id: 'x-ai/grok-4', name: 'Grok 4' },
      enterprise: { id: 'x-ai/grok-4', name: 'Grok 4' },
    },
  },
  {
    id: 'mistral',
    name: 'Mistral',
    provider: 'Mistral AI',
    description: "Mistral AI's efficient and open-weight models.",
    plans: {
      free: { id: 'mistralai/ministral-8b-2512', name: 'Ministral 8B' },
      pro: { id: 'mistralai/ministral-14b-2512', name: 'Ministral 14B' },
      enterprise: { id: 'mistralai/ministral-14b-2512', name: 'Ministral 14B' },
    },
  },
  {
    id: 'qwen',
    name: 'Qwen',
    provider: 'Alibaba Cloud',
    description: "Alibaba Cloud's Qwen models.",
    plans: {
      free: { id: 'qwen/qwen3.5-flash-02-23', name: 'Qwen3.5 Flash' },
      pro: { id: 'qwen/qwen3-max-thinking', name: 'Qwen3 Max Thinking' },
      enterprise: { id: 'qwen/qwen3-max-thinking', name: 'Qwen3 Max Thinking' },
    },
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    provider: 'DeepSeek',
    description: "DeepSeek's coding and reasoning models.",
    plans: {
      free: { id: 'deepseek/deepseek-v3.2', name: 'DeepSeek v3.2' },
      pro: { id: 'deepseek/deepseek-v3.2', name: 'DeepSeek v3.2' },
      enterprise: { id: 'deepseek/deepseek-v3.2', name: 'DeepSeek v3.2' },
    },
  },
  {
    id: 'xiaomi',
    name: 'Xiaomi',
    provider: 'Xiaomi',
    description: "Xiaomi's lightweight models.",
    plans: {
      free: { id: 'xiaomi/mimo-v2-flash', name: 'MiMo v2 Flash' },
      pro: { id: 'xiaomi/mimo-v2-flash', name: 'MiMo v2 Flash' },
      enterprise: { id: 'xiaomi/mimo-v2-flash', name: 'MiMo v2 Flash' },
    },
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    provider: 'Perplexity',
    description: "Perplexity's search-optimized models.",
    plans: {
      free: { id: 'perplexity/sonar', name: 'Sonar' },
      pro: {
        id: 'perplexity/sonar-deep-research',
        name: 'Sonar Deep Research',
      },
      enterprise: {
        id: 'perplexity/sonar-deep-research',
        name: 'Sonar Deep Research',
      },
    },
  },
  {
    id: 'llama',
    name: 'Llama',
    provider: 'Meta',
    description: "Meta's open-weight Llama models.",
    plans: {
      free: {
        id: 'meta-llama/llama-4-scout',
        name: 'Llama 4 Scout',
      },
      pro: {
        id: 'meta-llama/llama-4-maverick',
        name: 'Llama 4 Maverick',
      },
      enterprise: {
        id: 'meta-llama/llama-4-maverick',
        name: 'Llama 4 Maverick',
      },
    },
  },
];

export function getModelForTier(familyId: string, tier: string): ModelVariant {
  const family = MODEL_FAMILIES_CONFIG.find((f) => f.id === familyId);
  if (!family) {
    return { id: familyId, name: familyId };
  }

  if (tier === 'enterprise') return family.plans.enterprise;
  if (tier === 'pro') return family.plans.pro;
  return family.plans.free;
}
