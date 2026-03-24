'use client';

import { useSupabase } from '@/components/auth-provider';
import { PageHeader } from '@/components/page-header';
import { useToast } from '@/components/providers/toast-provider';
import { Button } from '@/components/ui/button';
import {
  getEffectiveCreditLimit,
  getPlanLimits,
  getReferralBonusContribution,
} from '@/lib/plans';
import { useSubscription } from '@/lib/use-subscription';
import { cn } from '@/lib/utils';
import { Check, ChevronDown, Copy } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface ProfileSettings {
  credits_balance: number;
  notify_on_completion: boolean;
  referral_code: string | null;
  referral_bonus_credits: number;
}

const EMPTY_PROFILE: ProfileSettings = {
  credits_balance: 0,
  notify_on_completion: true,
  referral_code: null,
  referral_bonus_credits: 0,
};

function Section({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-border-subtle rounded-sm bg-surface">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-5 text-left"
      >
        <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
        <ChevronDown
          size={16}
          className={cn(
            'text-text-muted transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && <div className="px-6 pb-6">{children}</div>}
    </div>
  );
}

export default function Settings() {
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileSettings>(EMPTY_PROFILE);
  const [copied, setCopied] = useState(false);
  const { supabase, user } = useSupabase();
  const { plan, isLoading: isLoadingSubscription } = useSubscription();
  const { error: showError } = useToast();

  const loadSettings = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select(
          'credits_balance, notify_on_completion, referral_code, referral_bonus_credits',
        )
        .eq('id', user.id)
        .single();

      if (fetchError) throw fetchError;

      setProfile({
        credits_balance: data.credits_balance,
        notify_on_completion: data.notify_on_completion ?? true,
        referral_code: data.referral_code ?? null,
        referral_bonus_credits: data.referral_bonus_credits ?? 0,
      });
      setError(null);
    } catch (err: any) {
      console.error('Error loading settings:', err);
      setError(err.message);
    }
  }, [supabase, user]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings, plan]);

  async function toggleNotify(value: boolean) {
    if (!user) return;

    setProfile((prev) => ({ ...prev, notify_on_completion: value }));

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ notify_on_completion: value })
      .eq('id', user.id);

    if (updateError) {
      console.error('Failed to update notification preference:', updateError);
      setProfile((prev) => ({
        ...prev,
        notify_on_completion: !value,
      }));
      showError('Failed to update notification preference.');
    }
  }

  async function copyReferralLink() {
    if (!referralLink) return;

    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy referral link:', err);
      showError('Could not copy the referral link.');
    }
  }

  const referralContribution = getReferralBonusContribution(
    plan,
    profile.referral_bonus_credits,
  );
  const effectiveLimit = getEffectiveCreditLimit(
    plan,
    profile.referral_bonus_credits,
  );
  const usedCredits = Math.max(0, effectiveLimit - profile.credits_balance);
  const usagePercent =
    effectiveLimit > 0 ? Math.min(100, (usedCredits / effectiveLimit) * 100) : 0;

  const referralLink = useMemo(() => {
    if (typeof window === 'undefined' || !profile.referral_code) return '';
    return `${window.location.origin}/register?ref=${profile.referral_code}`;
  }, [profile.referral_code]);

  if (error) {
    return (
      <div className="p-6 border border-red-200 rounded-lg bg-red-50 text-red-700">
        <h2 className="font-semibold mb-2">Error Loading Settings</h2>
        <p className="text-sm">{error}</p>
        <Button
          onClick={() => {
            setError(null);
            void loadSettings();
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

  if (isLoadingSubscription) {
    return <div className="p-8 text-text-secondary">Loading...</div>;
  }

  const enterpriseLimit = getPlanLimits('enterprise').monthly_credits;

  return (
    <div className="space-y-4">
      <PageHeader title="Settings" />

      <Section title="Notifications">
        <div className="flex items-center justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-text-primary">
              Email me when a run completes
            </p>
            <p className="text-xs text-text-secondary mt-1">
              Receive results in your inbox after each scheduled run finishes.
            </p>
          </div>
          <button
            onClick={() => toggleNotify(!profile.notify_on_completion)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50 ${
              profile.notify_on_completion
                ? 'bg-primary border-primary'
                : 'bg-surface-muted border-border-subtle'
            }`}
            role="switch"
            aria-checked={profile.notify_on_completion}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
                profile.notify_on_completion ? 'translate-x-5' : 'translate-x-0.5'
              } mt-0.5`}
            />
          </button>
        </div>
      </Section>

      <Section title="Referral Program">
        <div className="space-y-6">
          <p className="text-sm text-text-secondary">
            Share your referral link. Each successful signup increases your
            monthly allowance by 1 credit.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="p-4 bg-surface-muted/40 border border-border-subtle rounded-sm">
              <p className="text-[10px] uppercase tracking-widest text-text-secondary">
                Your Code
              </p>
              <p className="mt-2 font-mono text-lg text-text-primary">
                {profile.referral_code ?? 'Loading...'}
              </p>
            </div>
            <div className="p-4 bg-surface-muted/40 border border-border-subtle rounded-sm">
              <p className="text-[10px] uppercase tracking-widest text-text-secondary">
                Earned Bonuses
              </p>
              <p className="mt-2 font-mono text-lg text-text-primary">
                +{profile.referral_bonus_credits}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-xs uppercase tracking-wide text-text-secondary">
              Referral Link
            </label>
            <div className="flex flex-col gap-3 md:flex-row">
              <input
                type="text"
                readOnly
                value={referralLink}
                className="flex-1 px-3 py-2 bg-canvas border border-border-strong text-text-primary rounded-sm font-mono text-sm"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={copyReferralLink}
                disabled={!referralLink}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Copied' : 'Copy Link'}
              </Button>
            </div>
            {profile.referral_bonus_credits > referralContribution && (
              <p className="text-xs text-text-secondary">
                You've reached the maximum number of referrals for your plan. Thank you for spreading the word!
              </p>
            )}
          </div>
        </div>
      </Section>

      <Section title="Subscription">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="text-text-secondary uppercase text-[10px] tracking-widest font-bold">
              Current Tier
            </span>
            <span className="font-mono text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-sm border border-primary/20">
              {plan.toUpperCase()}
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-baseline text-sm">
              <span className="text-text-secondary">Monthly credits</span>
              <span className="font-mono text-text-primary">
                {profile.credits_balance} remaining of {effectiveLimit}
              </span>
            </div>
            <div className="w-full bg-surface-muted rounded-full h-2 overflow-hidden">
              <div
                className="bg-[var(--brand-amber)] h-full rounded-full transition-all"
                style={{ width: `${usagePercent}%` }}
              />
            </div>
          </div>

          {plan === 'free' && (
            <div className="border-t border-border-subtle pt-6">
              <div className="p-4 bg-primary-glow/10 rounded-sm border border-primary/20">
                <span className="font-medium text-text-primary mb-1 block">Ready for more?</span>
                <p className="text-xs text-text-secondary mb-5">
                  Access all Pro models from Google, OpenAI, and Anthropic. Run up to 2 LLMs per search, enable in-depth search, and unlock weekly and daily scheduling.
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

            {plan === 'pro' && (
              <div className="space-y-4 border-t border-border-subtle pt-6">
                <div className="p-4 bg-surface-muted rounded-sm border border-border-subtle">
                  <div className="flex-1">
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="font-medium text-text-primary">
                        Enterprise Tier
                      </span>
                      <span className="font-mono text-xs text-text-primary bg-surface px-2 py-0.5 rounded">
                        {enterpriseLimit} base credits/month
                      </span>
                    </div>
                    <p className="text-xs text-text-secondary mb-3">
                      Enterprise-grade monitoring with dedicated support and
                      unlimited scale.
                    </p>
                    <Button variant="secondary" size="lg" href="mailto:sales@sonde.ai">
                      Contact Sales
                    </Button>
                  </div>
                </div>

                <div className="p-4 border border-border-subtle rounded-sm bg-surface-muted/30 flex flex-col gap-4 md:flex-row md:justify-between md:items-center">
                  <div className="flex flex-col">
                    <h4 className="text-sm font-medium text-text-primary mb-2">
                      Manage Billing
                    </h4>
                    <p className="text-xs text-text-secondary">
                      Update your payment method, view invoices, or cancel your
                      subscription.
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={async () => {
                      try {
                        const { data, error: portalError } =
                          await supabase.functions.invoke('create-portal-session');
                        if (portalError) throw portalError;
                        if (data.url) window.location.href = data.url;
                      } catch (err) {
                        console.error('Portal error:', err);
                        showError(
                          'Could not open the billing portal. Please contact support.',
                        );
                      }
                    }}
                  >
                    Open Billing Portal
                  </Button>
                </div>
              </div>
            )}

            {plan === 'enterprise' && (
              <div className="border-t border-border-subtle pt-6 text-center py-6">
                <div className="w-12 h-12 mx-auto mb-3 bg-success/10 rounded-full flex items-center justify-center">
                  <Check size={24} className="text-success" />
                </div>
                <h4 className="font-medium text-text-primary mb-1">
                  Enterprise Plan
                </h4>
                <p className="text-xs text-text-secondary">
                  You have the highest tier with all features unlocked.
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
      </Section>
    </div>
  );
}
