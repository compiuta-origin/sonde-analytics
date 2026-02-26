// OpenRouter Client for Deno/Supabase Functions
// Designed to work in the Deno environment with proper TypeScript support

import { MODEL_FAMILIES_CONFIG } from './_shared/model-config.ts';

interface OpenRouterMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface OpenRouterProvider {
  order?: string[];
  allow_fallbacks?: boolean;
}

interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  provider?: OpenRouterProvider;
  plugins?: Array<{
    id: string;
    search_context_size?: string;
  }>;
  web_search_options?: {
    search_context_size: 'low' | 'medium' | 'high';
  };
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' };
}

interface OpenRouterResponse {
  id: string;
  choices: Array<{
    message: {
      content: string;
      role: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
}

export class OpenRouterClient {
  private apiKey: string;
  private baseUrl: string = 'https://openrouter.ai/api/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async chat(request: OpenRouterRequest): Promise<OpenRouterResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${error}`);
    }

    return response.json();
  }

  async executePrompt(
    query: string,
    model: string,
    useSearch: boolean = false,
    searchContextSize: 'low' | 'medium' | 'high' = 'medium',
  ): Promise<{
    response: string;
    tokenUsage: { input: number; output: number };
  }> {
    const request: OpenRouterRequest = {
      model,
      messages: [{ role: 'user', content: query }],
    };

    // Inject preferred provider order if the model's family defines one
    const family = MODEL_FAMILIES_CONFIG.find((f) =>
      f.plans.free.id === model ||
      f.plans.pro.id === model ||
      f.plans.enterprise.id === model
    );
    if (family?.preferred_providers && family.preferred_providers.length > 0) {
      request.provider = {
        order: family.preferred_providers,
        allow_fallbacks: true,
      };
    }

    // Enable web search if requested
    if (useSearch) {
      request.plugins = [{ id: 'web' }];
      request.web_search_options = { search_context_size: searchContextSize };
    }

    const result = await this.chat(request);
    const response = result.choices[0].message.content;

    return {
      response,
      tokenUsage: {
        input: result.usage.prompt_tokens,
        output: result.usage.completion_tokens,
      },
    };
  }

  async judge(
    responseText: string,
    ruleDescription: string,
    ruleType: 'binary' | 'ranking' | 'sentiment',
  ): Promise<{ score: number; reasoning: string }> {
    const systemPrompt = this.getJudgePrompt(ruleType, ruleDescription);

    const request: OpenRouterRequest = {
      model: 'openai/gpt-5-nano',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Response to evaluate:\n\n${responseText}` },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    };

    const result = await this.chat(request);
    const judgeResponse = result.choices[0].message.content;

    return this.parseJudgeResponse(judgeResponse);
  }

  private getJudgePrompt(ruleType: string, ruleDescription: string): string {
    const prompts: Record<string, string> = {
      binary: `You are evaluating if a brand or topic is mentioned in an AI response.

Rule to evaluate: ${ruleDescription}

Analyze the response and return ONLY valid JSON with this exact structure:
{"score": 0 or 1, "reasoning": "brief explanation"}

- score: 0 if not mentioned/not present, 1 if mentioned/present
- reasoning: brief explanation of your decision (1-2 sentences max)

Return ONLY the JSON, no other text.`,

      ranking: `You are finding the ranking position of a brand or item in a list within an AI response.

Rule to evaluate: ${ruleDescription}

Analyze the response and return ONLY valid JSON with this exact structure:
{"score": <position number>, "reasoning": "brief explanation"}

- score: The position number (1 for first, 2 for second, etc.) or 0 if not found in any list
- reasoning: brief explanation of where it was found (1-2 sentences max)

If there are multiple lists, use the first relevant one. Return ONLY the JSON, no other text.`,

      sentiment: `You are evaluating the sentiment toward a brand or topic in an AI response.

Rule to evaluate: ${ruleDescription}

Analyze the response and return ONLY valid JSON with this exact structure:
{"score": <number from -1 to 1>, "reasoning": "brief explanation"}

- score: -1 (very negative) to 1 (very positive), 0 for neutral
- reasoning: brief explanation of the sentiment (1-2 sentences max)

Consider tone, word choice, and context. Return ONLY the JSON, no other text.`,
    };

    return prompts[ruleType] || prompts.binary;
  }

  private parseJudgeResponse(response: string): {
    score: number;
    reasoning: string;
  } {
    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = response.trim();

      // Remove markdown code blocks if present
      jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');

      // Find JSON object
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate score exists
      if (parsed.score === undefined || parsed.score === null) {
        throw new Error('Score not found in response');
      }

      return {
        score: parseFloat(parsed.score),
        reasoning: parsed.reasoning || 'No reasoning provided',
      };
    } catch (error: any) {
      console.error('Failed to parse judge response:', error);

      // Return default based on type
      return {
        score: 0,
        reasoning: `Failed to parse judge response: ${error.message}`,
      };
    }
  }
}

export default OpenRouterClient;
