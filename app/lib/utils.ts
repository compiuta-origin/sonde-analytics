import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type ScheduleType = 'manual' | 'daily' | 'weekly' | 'monthly';

export function generateAlignedCron(type: ScheduleType): string {
  if (type === 'manual') return '';

  const now = new Date();
  const min = now.getUTCMinutes();
  const hour = now.getUTCHours();
  const day = now.getUTCDate();
  const dow = now.getUTCDay(); // 0-6 (Sun-Sat)

  // For monthly, cap at 28 to ensure it runs every month
  const safeDay = day > 28 ? 28 : day;

  switch (type) {
    case 'daily':
      return `${min} ${hour} * * *`;
    case 'weekly':
      return `${min} ${hour} * * ${dow}`;
    case 'monthly':
      return `${min} ${hour} ${safeDay} * *`;
    default:
      return '';
  }
}

export function estimateMonthlyRuns(cron: string): number {
  if (!cron) return 0;
  const parts = cron.split(' ');
  if (parts.length !== 5) return 0;

  const [min, hour, dom, mon, dow] = parts;

  if (min === '*' && hour === '*' && dom === '*' && mon === '*' && dow === '*') return 43200; // Every minute
  if (min !== '*' && hour !== '*' && dom === '*' && mon === '*' && dow === '*') return 30; // Daily
  if (min !== '*' && hour !== '*' && dom !== '*' && mon === '*' && dow === '*') return 1; // Monthly
  if (min !== '*' && hour !== '*' && dom === '*' && mon === '*' && dow !== '*') return 4; // Weekly (approx)

  // Default fallback for complex crons (treat as daily for safety if unknown)
  return 30;
}
