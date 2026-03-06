'use client';

import { useTour } from '@/lib/use-tour';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../ui/button';
import DashboardStep from './steps/dashboard-step';
import NewPromptStep from './steps/new-prompt-step';
import PromptListStep from './steps/prompt-list-step';

const STEPS = [
  {
    title: 'Track your brand visibility',
    description:
      'The Dashboard gives you a bird\'s-eye view of how your brand appears across AI responses — average rank, share of voice, and total runs at a glance.',
    Visual: DashboardStep,
  },
  {
    title: 'Manage your prompts',
    description:
      'The Prompt List shows every query you\'re tracking. Each prompt runs on a schedule and evaluates AI responses against your custom rules.',
    Visual: PromptListStep,
  },
  {
    title: 'Create your first prompt',
    description:
      'Define a question, pick a schedule, select AI models, and add evaluation rules. Sonde will run it automatically and surface insights over time.',
    Visual: NewPromptStep,
  },
];

export default function WelcomeTour() {
  const { tourCompleted, completeTour } = useTour();
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const firstButtonRef = useRef<HTMLButtonElement>(null);

  const handleFinish = useCallback(async () => {
    await completeTour();
    router.push('/prompts/new');
  }, [completeTour, router]);

  const handleDismiss = useCallback(async () => {
    await completeTour();
    router.push('/dashboard');
  }, [completeTour, router]);

  useEffect(() => {
    if (tourCompleted === false) {
      firstButtonRef.current?.focus();
    }
  }, [tourCompleted]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && tourCompleted === false) {
        handleDismiss();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tourCompleted, handleDismiss]);

  if (tourCompleted === null || tourCompleted === true) return null;

  const step = STEPS[currentStep];
  const Visual = step.Visual;
  const isFirst = currentStep === 0;
  const isLast = currentStep === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        className="relative flex h-[480px] w-full max-w-md flex-col rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Welcome tour"
      >
        {/* Header */}
        <div className="mb-4 flex shrink-0 items-center justify-between">
          <span className="text-sm font-medium text-[var(--text-primary)]">
            Sonde &nbsp;·&nbsp; Step {currentStep + 1} of {STEPS.length}
          </span>
          <button
            onClick={handleDismiss}
            className="rounded-sm p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/50"
            aria-label="Close tour"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Visual area — fills available space to keep modal height fixed */}
        <div className="mb-5 flex flex-1 items-center overflow-hidden">
          <Visual />
        </div>

        {/* Text */}
        <h2 className="mb-1 shrink-0 text-base font-semibold text-[var(--text-primary)]">{step.title}</h2>
        <p className="mb-5 shrink-0 text-sm leading-relaxed text-[var(--text-muted)]">{step.description}</p>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between">
          {/* Step dots */}
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  i === currentStep
                    ? 'bg-[var(--brand-amber)]'
                    : 'bg-[var(--border-subtle)]'
                }`}
              />
            ))}
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center gap-2">
            {!isFirst && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCurrentStep((s) => s - 1)}
              >
                Back
              </Button>
            )}
            {isLast ? (
              <Button
                ref={isFirst ? firstButtonRef : undefined}
                variant="primary"
                size="sm"
                onClick={handleFinish}
              >
                Get started
              </Button>
            ) : (
              <Button
                ref={isFirst ? firstButtonRef : undefined}
                variant="primary"
                size="sm"
                onClick={() => setCurrentStep((s) => s + 1)}
              >
                Next
              </Button>
            )}
          </div>
        </div>

        {/* Skip */}
        <div className="mt-3 shrink-0 text-center">
          <button
            onClick={handleDismiss}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] focus:outline-none underline underline-offset-2"
          >
            Skip tour
          </button>
        </div>
      </div>
    </div>
  );
}
