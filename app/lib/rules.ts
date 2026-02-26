import { CircleCheck, ListOrdered, Smile } from 'lucide-react';
import React from 'react';

export type RuleType = 'binary' | 'ranking' | 'sentiment';

export interface RuleTypeConfig {
  id: RuleType;
  label: string;
  icon: React.ElementType;
  hint: string;
}

export const RULE_TYPES: RuleTypeConfig[] = [
  {
    id: 'binary',
    label: 'Binary',
    icon: CircleCheck,
    hint: "Enter a Yes/No question (e.g., 'Is [Brand] mentioned in the response?')",
  },
  {
    id: 'ranking',
    label: 'Ranking',
    icon: ListOrdered,
    hint: "Describe the target to rank (e.g., 'Position of [Brand] in the list')",
  },
  {
    id: 'sentiment',
    label: 'Sentiment',
    icon: Smile,
    hint: "Describe the topic to evaluate (e.g., 'How likely is [brand] to gain adoption?')",
  },
];

export const RULE_TYPES_BY_ID = RULE_TYPES.reduce((acc, rule) => {
  acc[rule.id] = rule;
  return acc;
}, {} as Record<string, RuleTypeConfig>);
