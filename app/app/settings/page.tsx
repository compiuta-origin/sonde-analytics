// app/settings/page.tsx
'use client';

import { useSupabase } from '@/components/auth-provider';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { getPlanLimits } from '@/lib/plans';
import { useSubscription } from '@/lib/use-subscription';
import { ArrowRight, Check } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function Settings() {
  const [error, setError] = useState<string | null>(null);
  const [creditUsage, setCreditUsage] = useState<number>(0);
  const [creditsBalance, setCreditsBalance] = useState<number>(0);
  const { supabase, user } = useSupabase();
  const { plan, isLoading: isLoadingSubscription } = useSubscription();

  useEffect(() => {
    loadCredits();
  }, [user]);

  async function loadCredits() {
    if (!user) return;

    try {
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('credits_balance')
        .eq('id', user.id)
        .single();

      if (fetchError) throw fetchError;
      setCreditsBalance(data.credits_balance);

      // Calculate credit usage
      // credits_balance = remaining credits
      // usedCredits = total credits for tier - remaining credits
      const totalCredits = getPlanLimits(plan).monthly_credits;
      const remainingCredits = data.credits_balance;
      const usedCredits = Math.max(0, totalCredits - remainingCredits);

      setCreditUsage(usedCredits);
    } catch (err: any) {
      console.error('Error loading profile:', err);
      setError(err.message);
    }
  }

  // Recalculate usage when plan changes (e.g. initial load)
  useEffect(() => {
    if (creditsBalance !== null) {
      const totalCredits = getPlanLimits(plan).monthly_credits;
      const usedCredits = Math.max(0, totalCredits - creditsBalance);
      setCreditUsage(usedCredits);
    }
  }, [plan, creditsBalance]);

  if (error) {
    return (
      <div className="p-6 border border-red-200 rounded-lg bg-red-50 text-red-700">
        <h2 className="font-semibold mb-2">Error Loading Settings</h2>
        <p className="text-sm">{error}</p>
        <Button
          onClick={() => {
            setError(null);
            loadCredits();
          }}
          className="mt-4"
          variant="secondary"
          size="sm"
        >
          Retry
        </Button>
      </div>
    );
  }

  if (isLoadingSubscription)
    return <div className="p-8 text-text-secondary">Loading...</div>;

  const limit = getPlanLimits(plan).monthly_credits;
  const proLimit = getPlanLimits('pro').monthly_credits;
  const enterpriseLimit = getPlanLimits('enterprise').monthly_credits;

  return (
    <div className="space-y-8">
      <PageHeader title="Settings" />

      {/* Subscription Card with Credit Usage Visualization */}
      <div className="p-6 border border-border-subtle rounded-sm bg-surface">
        <h2 className="text-xl font-semibold text-text-primary mb-6">
          Subscription
        </h2>

        {/* Current Tier Info */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-text-secondary uppercase text-[10px] tracking-widest font-bold">
              Current Tier
            </span>
            <span className="font-mono text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-sm border border-primary/20">
              {plan.toUpperCase()}
            </span>
          </div>

          {/* Credit Usage Progress */}
          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-text-secondary">Credit Usage</span>
              <span className="font-mono text-text-primary">
                {creditUsage} / {limit} credits used
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-surface-muted rounded-full h-3 overflow-hidden">
              <div
                className="bg-[var(--brand-amber)] h-full rounded-full transition-all"
                style={{
                  width: `${(creditUsage / limit) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Upgrade Path Section */}
        <div className="border-t border-border-subtle pt-6">
          <h3 className="text-sm font-medium text-text-primary mb-4">
            Upgrade Options
          </h3>

          {/* Free users see Pro upgrade */}
          {plan === 'free' && (
            <div className="flex items-start gap-3 p-4 bg-primary-glow/10 rounded-sm border border-primary/20">
              <ArrowRight
                size={16}
                className="text-primary mt-1 flex-shrink-0"
              />
              <div className="flex-1">
                <div className="flex justify-between items-baseline mb-1">
                  <span className="font-medium text-text-primary">
                    Pro Tier
                  </span>
                  <span className="font-mono text-xs text-primary bg-primary/10 px-2 py-0.5 rounded">
                    {proLimit} credits/month
                  </span>
                </div>
                <p className="text-xs text-text-secondary mb-5">
                  Unlock advanced monitoring, priority support, and 50x more
                  credits
                </p>
                <div className="flex justify-center w-full">
                  <Button
                    onClick={() => (window.location.href = '/upgrade')}
                    variant="primary"
                    size="lg"
                    className="shadow-[0_0_20px_rgba(245,158,11,0.2)]"
                  >
                    Upgrade Now
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Pro users see Enterprise upgrade and Manage Subscription */}
          {plan === 'pro' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-surface-muted rounded-sm border border-border-subtle">
                <ArrowRight
                  size={16}
                  className="text-text-primary mt-1 flex-shrink-0"
                />
                <div className="flex-1">
                  <div className="flex justify-between items-baseline mb-1">
                    <span className="font-medium text-text-primary">
                      Enterprise Tier
                    </span>
                    <span className="font-mono text-xs text-text-primary bg-surface px-2 py-0.5 rounded">
                      {enterpriseLimit} credits/month
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary mb-3">
                    Enterprise-grade monitoring with dedicated support and
                    unlimited scale
                  </p>
                  <Button
                    variant="secondary"
                    size="lg"
                    href="mailto:sales@sonde.ai"
                  >
                    Contact Sales
                  </Button>
                </div>
              </div>

              <div className="p-4 border border-border-subtle rounded-sm bg-surface-muted/30 flex justify-between items-center">
                <div className="flex flex-col">
                  <h4 className="text-sm font-medium text-text-primary mb-2">
                    Manage Billing
                  </h4>
                  <p className="text-xs text-text-secondary mb-4">
                    Update your payment method, view invoices, or cancel your
                    subscription.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={async () => {
                    try {
                      const { data, error } = await supabase.functions.invoke(
                        'create-portal-session'
                      );
                      if (error) throw error;
                      if (data.url) window.location.href = data.url;
                    } catch (err) {
                      console.error('Portal error:', err);
                      alert(
                        'Could not open billing portal. Please contact support.'
                      );
                    }
                  }}
                >
                  Open Billing Portal
                </Button>
              </div>
            </div>
          )}

          {/* Enterprise users see confirmation */}
          {plan === 'enterprise' && (
            <div className="text-center py-6">
              <div className="w-12 h-12 mx-auto mb-3 bg-success/10 rounded-full flex items-center justify-center">
                <Check size={24} className="text-success" />
              </div>
              <h4 className="font-medium text-text-primary mb-1">
                Enterprise Plan
              </h4>
              <p className="text-xs text-text-secondary">
                You have the highest tier with all features unlocked
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                href="mailto:support@sonde.ai"
              >
                Contact Support
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
