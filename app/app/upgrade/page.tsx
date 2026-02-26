// app/upgrade/page.tsx
'use client';

import SubscribeButton from '@/components/subscribe-button';
import { useSubscription } from '@/lib/use-subscription';
import { cn } from '@/lib/utils';
import { AlertCircle, Check } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

function UpgradeContent() {
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>(
    'yearly',
  );
  const [currency, setCurrency] = useState<'EUR' | 'USD'>('EUR');

  const searchParams = useSearchParams();
  const canceled = searchParams.get('canceled') === 'true';
  const { plan: currentPlan, isLoading } = useSubscription();

  const isPro = currentPlan === 'pro';

  // Pricing configuration
  const prices = {
    EUR: {
      monthly: '9€',
      yearly: '7,50€',
      totalYearly: '90€',
    },
    USD: {
      monthly: '$10',
      yearly: '$8.33', // 100/12 is roughly 8.33
      totalYearly: '$100',
    },
  };

  const currentPrices = prices[currency];

  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <div className="text-center space-y-4 mb-12">
        <h1 className="text-4xl font-bold tracking-tight text-text-primary">
          {isPro ? 'Your Subscription' : 'Upgrade to Pro'}
        </h1>
        <p className="text-lg text-text-secondary max-w-xl mx-auto">
          {isPro
            ? 'You are currently enjoying the benefits of Sonde Pro.'
            : 'Get 10 monthly credits, in-depth search and access to all advanced models.'}
        </p>

        {canceled && (
          <div className="max-w-md mx-auto mt-6 p-4 rounded-sm border border-red-900/50 bg-red-900/10 text-red-400 flex items-center gap-3 animate-in fade-in zoom-in duration-300">
            <AlertCircle size={20} />
            <p className="text-sm text-left font-medium">
              Checkout was canceled. No changes were made to your account.
            </p>
          </div>
        )}
      </div>

      {!isPro ? (
        <div className="bg-surface border border-primary/30 rounded-sm overflow-hidden shadow-[0_0_50px_rgba(245,158,11,0.05)]">
          <div className="p-8 border-b border-border-subtle bg-surface-muted/30">
            <div className="flex flex-col md:flex-row justify-between items-center gap-8">
              <div className="flex flex-col items-start gap-4">
                <h2 className="text-2xl font-bold text-text-primary">
                  Sonde Pro
                </h2>
                <p className="text-text-secondary text-sm">
                  Includes everything you need for professional brand
                  monitoring.
                </p>
                {/* Currency Toggle (Switch Style) */}
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'text-xs font-medium select-none',
                      currency === 'EUR'
                        ? 'text-text-primary'
                        : 'text-text-muted',
                    )}
                  >
                    EUR
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={currency === 'USD'}
                    onClick={() =>
                      setCurrency((prev) => (prev === 'EUR' ? 'USD' : 'EUR'))
                    }
                    className={cn(
                      'relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-1 focus:ring-primary focus:ring-offset-0 border',
                      currency === 'USD'
                        ? 'bg-primary/20 border-primary/50'
                        : 'bg-transparent border-border-strong',
                    )}
                  >
                    <span
                      className={cn(
                        'pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full shadow ring-0 transition duration-200 ease-in-out bg-gray-300',
                        currency === 'USD'
                          ? 'translate-x-5.5 shadow-[0_0_8px_rgba(245,158,11,0.4)]'
                          : 'translate-x-1',
                      )}
                    />
                  </button>
                  <span
                    className={cn(
                      'text-xs font-medium select-none',
                      currency === 'USD'
                        ? 'text-text-primary'
                        : 'text-text-muted',
                    )}
                  >
                    USD
                  </span>
                </div>
              </div>

              <div className="flex flex-col items-center space-y-4">
                {/* Billing Interval Toggle (Switch Style) */}
                <div className="flex items-center md:items-end gap-3">
                  <span
                    className={cn(
                      'text-xs font-medium select-none',
                      billingInterval === 'monthly'
                        ? 'text-text-primary'
                        : 'text-text-muted',
                    )}
                  >
                    Monthly
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={billingInterval === 'yearly'}
                    onClick={() =>
                      setBillingInterval((prev) =>
                        prev === 'monthly' ? 'yearly' : 'monthly',
                      )
                    }
                    className={cn(
                      'relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-1 focus:ring-primary focus:ring-offset-0 border',
                      billingInterval === 'yearly'
                        ? 'bg-primary/20 border-primary/50'
                        : 'bg-transparent border-border-strong',
                    )}
                  >
                    <span
                      className={cn(
                        'pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full shadow ring-0 transition duration-200 ease-in-out bg-gray-300',
                        billingInterval === 'yearly'
                          ? 'translate-x-5.5 shadow-[0_0_8px_rgba(245,158,11,0.4)]'
                          : 'translate-x-1 ',
                      )}
                    />
                  </button>
                  <span
                    className={cn(
                      'text-xs font-medium select-none flex items-center gap-1.5',
                      billingInterval === 'yearly'
                        ? 'text-text-primary'
                        : 'text-text-muted',
                    )}
                  >
                    Yearly
                    <span className="text-[9px] px-1 py-0.5 rounded-sm bg-primary/20 text-primary uppercase font-black">
                      -10%
                    </span>
                  </span>
                </div>

                <div className="flex flex-col items-center md:items-end">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-mono font-bold text-text-primary">
                      {billingInterval === 'monthly'
                        ? currentPrices.monthly
                        : currentPrices.yearly}
                    </span>
                    <span className="text-text-muted text-sm">/month</span>
                  </div>
                  {billingInterval === 'yearly' && (
                    <span className="text-[10px] text-primary font-bold mt-1 font-mono">
                      {currentPrices.totalYearly} billed annually
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="p-8 grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">
                What's included
              </h3>
              <ul className="space-y-3">
                {[
                  '10 credits per month (resets monthly)',
                  'Full access to all Pro models from Google, OpenAI, Anthropic & more',
                  'Up to 2 LLMs per-search',
                  'In-depth search',
                  'Unlock weekly and daily searches',
                ].map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm">
                    <Check size={16} className="text-primary mt-0.5 shrink-0" />
                    <span className="text-text-secondary">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col justify-center space-y-6">
              <SubscribeButton
                interval={billingInterval}
                currency={currency}
                className="w-full py-7 text-lg shadow-[0_10px_30px_rgba(245,158,11,0.15)]"
              >
                Go to Checkout
              </SubscribeButton>

              <p className="text-[10px] text-center text-text-muted font-mono uppercase">
                Secure payment via Stripe • Cancel anytime
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-surface border border-border-subtle p-12 rounded-sm text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Check size={32} className="text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-text-primary mb-2">
            You are a Pro member
          </h2>
          <p className="text-text-secondary mb-8">
            Thank you for supporting Sonde. You have full access to all
            features.
          </p>
          <button
            onClick={() => (window.location.href = '/settings')}
            className="px-6 py-2 border border-border-strong rounded-sm hover:bg-surface-muted transition-colors text-sm font-medium"
          >
            Manage Subscription
          </button>
        </div>
      )}
    </div>
  );
}

export default function UpgradePage() {
  return (
    <Suspense
      fallback={
        <div className="p-12 text-center text-text-muted font-mono uppercase tracking-widest text-xs">
          Loading Upgrade options...
        </div>
      }
    >
      <UpgradeContent />
    </Suspense>
  );
}
