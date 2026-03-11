'use client';

import { useToast } from '@/components/providers/toast-provider';
import { Button } from '@/components/ui/button';
import { createBrowserClient } from '@/lib/supabase';
import Link from 'next/link';
import { Suspense, useState } from 'react';

function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const supabase = createBrowserClient();
  const { error: showError } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    });

    if (error) {
      showError(error.message);
      setLoading(false);
      return;
    }

    setSubmitted(true);
    setLoading(false);
  }

  if (submitted) {
    return (
      <div className="w-full max-w-md bg-surface border border-border-subtle px-6 py-8 rounded-md shadow-none">
        <h1 className="text-3xl font-semibold tracking-tight text-text-primary">
          Check your email
        </h1>
        <p className="text-sm text-text-secondary mt-2 mb-6">
          If an account exists for <span className="text-text-primary font-mono">{email}</span>, you will receive a password reset link shortly.
        </p>
        <p className="text-xs text-text-muted mb-6">
          Did not receive an email? Check your spam folder or try again.
        </p>
        <div className="flex flex-col gap-2">
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => { setSubmitted(false); setEmail(''); }}
          >
            Try again
          </Button>
          <Link
            href="/login"
            className="text-sm text-center text-text-secondary hover:text-text-primary transition-colors"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md bg-surface border border-border-subtle px-6 py-8 rounded-md shadow-none">
      <h1 className="text-3xl font-semibold tracking-tight text-text-primary">
        Reset your password
      </h1>
      <p className="text-sm text-text-secondary mb-6">
        Enter your email address and we&apos;ll send you a reset link.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label className="block text-xs uppercase tracking-wide text-text-secondary">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 bg-canvas border border-border-strong text-text-primary placeholder:text-text-muted rounded-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary font-mono text-sm"
            placeholder="you@example.com"
            required
          />
        </div>

        <Button
          type="submit"
          disabled={loading}
          variant="primary"
          className="w-full"
        >
          {loading ? 'Sending...' : 'Send Reset Link'}
        </Button>
      </form>

      <div className="mt-6 text-center">
        <p className="text-sm text-text-secondary">
          Remember your password?{' '}
          <Link href="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Suspense fallback={<div className="text-text-muted font-mono text-xs uppercase tracking-widest">Loading...</div>}>
        <ForgotPasswordForm />
      </Suspense>
    </div>
  );
}
