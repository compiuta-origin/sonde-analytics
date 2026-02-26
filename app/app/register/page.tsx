'use client';

import { useToast } from '@/components/providers/toast-provider';
import { Button } from '@/components/ui/button';
import { getEnv } from '@/lib/env';
import { createBrowserClient } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

function RegisterForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createBrowserClient();
  const { success: showSuccess, error: showError } = useToast();

  const next = searchParams.get('next') || '/dashboard';
  const redirectPath = next.startsWith('/') ? next : `/${next}`;
  const postSignupMessage =
    'If your registration is valid, check your email for next steps, then sign in.';

  const termsUrl = getEnv('TERMS_URL') || '#';

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (!acceptedTerms) return;
    setLoading(true);

    if (password !== confirmPassword) {
      showError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      showError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}${redirectPath}`,
      },
    });

    if (error) {
      showError(error.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      router.refresh();
      router.push(redirectPath);
      return;
    }

    if (!data.user?.email_confirmed_at) {
      showSuccess(postSignupMessage);
      router.push(
        `/login${searchParams.toString() ? `?${searchParams.toString()}` : ''}`,
      );
      setLoading(false);
      return;
    }

    // Fallback for environments where signUp may not return a session immediately
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      showSuccess(postSignupMessage);
      router.push(
        `/login${searchParams.toString() ? `?${searchParams.toString()}` : ''}`,
      );
      setLoading(false);
      return;
    }

    router.refresh();
    router.push(redirectPath);
  }

  return (
    <div className="w-full max-w-md bg-surface border border-border-subtle px-6 py-8 rounded-md shadow-none">
      <h1 className="text-3xl font-semibold tracking-tight text-text-primary">
        Create an account
      </h1>
      <p className="text-sm text-text-secondary mb-6">
        Start tracking your brand visibility across LLMs
      </p>

      <form onSubmit={handleSignUp} className="space-y-4">
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

        <div className="space-y-2">
          <label className="block text-xs uppercase tracking-wide text-text-secondary">
            Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-canvas border border-border-strong text-text-primary placeholder:text-text-muted rounded-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary font-mono text-sm pr-10"
              placeholder="••••••••"
              required
              minLength={6}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
              title={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <p className="text-xs text-text-muted mt-1 font-mono">
            At least 6 characters
          </p>
        </div>

        <div className="space-y-2">
          <label className="block text-xs uppercase tracking-wide text-text-secondary">
            Confirm Password
          </label>
          <div className="relative">
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 bg-canvas border border-border-strong text-text-primary placeholder:text-text-muted rounded-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary font-mono text-sm pr-10"
              placeholder="••••••••"
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
              title={showConfirmPassword ? 'Hide password' : 'Show password'}
            >
              {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 py-2">
          <button
            type="button"
            role="switch"
            aria-checked={acceptedTerms}
            onClick={() => setAcceptedTerms(!acceptedTerms)}
            className={cn(
              'relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-1 focus:ring-primary focus:ring-offset-0 border',
              acceptedTerms
                ? 'bg-primary/20 border-primary/50'
                : 'bg-transparent border-border-strong',
            )}
          >
            <span
              className={cn(
                'pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full shadow ring-0 transition duration-200 ease-in-out',
                acceptedTerms
                  ? 'translate-x-5.5 bg-white/80'
                  : 'translate-x-1 bg-gray-300',
              )}
            />
          </button>
          <span
            className={cn(
              'text-xs font-medium cursor-pointer select-none text-text-secondary',
              acceptedTerms && 'text-text-primary',
            )}
            onClick={() => setAcceptedTerms(!acceptedTerms)}
          >
            I&apos;ve read and accept{' '}
            <a
              href={termsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              Terms and Privacy Policy
            </a>
          </span>
        </div>

        <Button
          type="submit"
          disabled={loading || !acceptedTerms}
          variant="primary"
          className="w-full"
        >
          {loading ? 'Creating account...' : 'Sign Up'}
        </Button>
      </form>

      <div className="mt-6 text-center space-y-2">
        <p className="text-sm text-text-secondary">
          Already have an account?{' '}
          <Link
            href={`/login${searchParams.toString() ? `?${searchParams.toString()}` : ''}`}
            className="text-primary hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Suspense
        fallback={
          <div className="text-text-muted font-mono text-xs uppercase tracking-widest">
            Loading...
          </div>
        }
      >
        <RegisterForm />
      </Suspense>
    </div>
  );
}
