'use client';

import { Button } from '@/components/ui/button';
import { cn, generateAlignedCron, type ScheduleType } from '@/lib/utils';
import { Lock } from 'lucide-react';
import { useEffect, useState } from 'react';

export const SCHEDULE_TIERS: Record<ScheduleType, string[]> = {
  manual: ['free', 'pro', 'enterprise'],
  daily: ['pro', 'enterprise'],
  weekly: ['pro', 'enterprise'],
  monthly: ['free', 'pro', 'enterprise'],
};

interface CronSchedulerProps {
  value: string;
  onChange: (cron: string) => void;
  className?: string;
  plan?: string;
}

export function CronScheduler({
  value,
  onChange,
  className,
  plan = 'free',
}: CronSchedulerProps) {
  const [selectedType, setSelectedType] = useState<ScheduleType>('manual');

  useEffect(() => {
    // Determine schedule type from cron value
    if (!value) {
      setSelectedType('manual');
      return;
    }

    const parts = value.split(' ');
    if (parts.length !== 5) {
      setSelectedType('manual'); // Fallback for custom/invalid
      return;
    }

    const [min, hour, day, month, dow] = parts;

    if (
      min !== '*' &&
      hour !== '*' &&
      day === '*' &&
      month === '*' &&
      dow === '*'
    ) {
      setSelectedType('daily');
    } else if (
      min !== '*' &&
      hour !== '*' &&
      day === '*' &&
      month === '*' &&
      dow !== '*'
    ) {
      setSelectedType('weekly');
    } else if (
      min !== '*' &&
      hour !== '*' &&
      day !== '*' &&
      month === '*' &&
      dow === '*'
    ) {
      setSelectedType('monthly');
    } else {
      setSelectedType('manual');
    }
  }, [value]);

  function handleTypeChange(type: ScheduleType) {
    if (!SCHEDULE_TIERS[type].includes(plan)) return;

    setSelectedType(type);
    if (type === 'manual') {
      onChange('');
    } else {
      const newCron = generateAlignedCron(type);
      onChange(newCron);
    }
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap bg-canvas border border-border-strong rounded-sm p-0.5 w-fit">
        {(
          ['monthly', 'weekly', 'daily', 'manual'] as ScheduleType[]
        ).map((type) => {
          const isAllowed = SCHEDULE_TIERS[type].includes(plan);
          const isActive = selectedType === type;
          
          return (
            <button
              key={type}
              type="button"
              onClick={() => handleTypeChange(type)}
              disabled={!isAllowed}
              className={cn(
                'px-3 py-1.5 text-[10px] uppercase tracking-tight rounded-sm transition-all flex items-center gap-1.5 cursor-pointer',
                isActive 
                  ? 'text-[var(--brand-amber)] font-medium' 
                  : 'text-text-muted hover:text-text-primary font-bold',
                !isAllowed && 'opacity-40 cursor-not-allowed grayscale'
              )}
              title={!isAllowed ? 'Upgrade plan to access this schedule' : ''}
            >
              {!isAllowed && <Lock size={10} />}
              {type}
            </button>
          );
        })}
      </div>

      <div className="p-3 bg-surface-muted border border-border-subtle rounded-sm text-sm">
        {selectedType === 'manual' ? (
          <p className="text-text-secondary">
            No periodicity selected. The prompt will need to be triggered
            manually.
          </p>
        ) : (
          <p className="text-text-secondary">
            Schedule set to{' '}
            <span className="font-semibold capitalize">{selectedType}</span>.
          </p>
        )}
      </div>
    </div>
  );
}

export function getHumanReadableCron(cron: string): string {
  if (!cron) return 'Manual';

  const parts = cron.split(' ');
  if (parts.length !== 5) return 'Invalid Cron';

  const [min, hour, day, month, dow] = parts;

  if (
    min !== '*' &&
    hour !== '*' &&
    day === '*' &&
    month === '*' &&
    dow === '*'
  ) {
    return `Daily`;
  }
  if (
    min !== '*' &&
    hour !== '*' &&
    day === '*' &&
    month === '*' &&
    dow !== '*'
  ) {
    return `Weekly`;
  }
  if (
    min !== '*' &&
    hour !== '*' &&
    day !== '*' &&
    month === '*' &&
    dow === '*'
  ) {
    return `Monthly`;
  }

  return 'Custom Schedule';
}
