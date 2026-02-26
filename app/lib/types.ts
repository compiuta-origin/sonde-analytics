// lib/types.ts
export interface Profile {
  id: string;
  email: string;
  credits_balance: number;
  created_at: string;
}

export interface TargetConfig {
  model: string;
  use_search: boolean;
}

export interface Prompt {
  id: string;
  user_id: string;
  query_text: string;
  schedule_cron?: string;
  is_active: boolean;
  target_config: TargetConfig[];
  created_at: string;
}

export interface Rule {
  id: string;
  prompt_id: string;
  name: string;
  description: string;
  type: 'binary' | 'ranking' | 'sentiment';
  created_at: string;
}

export interface Run {
  id: string;
  prompt_id: string;
  model_used: string;
  web_search_enabled: boolean;
  response_text?: string;
  token_usage_input?: number;
  token_usage_output?: number;
  executed_at: string;
}

export interface Evaluation {
  id: string;
  run_id: string;
  rule_id: string;
  score: number;
  reasoning?: string;
  created_at: string;
}
