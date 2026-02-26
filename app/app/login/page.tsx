'use client';

import { useToast } from '@/components/providers/toast-provider';
import { Button } from '@/components/ui/button';
import { createBrowserClient } from '@/lib/supabase';
import { Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createBrowserClient();
  const { error: showError } = useToast();

  const next = searchParams.get('next') || '/dashboard';
  const redirectPath = next.startsWith('/') ? next : `/${next}`;

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      showError(error.message);
      setLoading(false);
    } else {
      router.push(redirectPath);
      router.refresh();
    }
  }

  return (
    <div className="w-full max-w-md bg-surface border border-border-subtle px-6 py-8 rounded-md shadow-none">
      <h1 className="text-3xl font-semibold tracking-tight text-text-primary">
        Welcome back
      </h1>
      <p className="text-sm text-text-secondary mb-6">
        Sign in to your Sonde account
      </p>

      <form onSubmit={handleSignIn} className="space-y-4">
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
        </div>

        <Button
          type="submit"
          disabled={loading}
          variant="primary"
          className="w-full"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </Button>
      </form>

      <div className="mt-6 text-center space-y-2">
        <p className="text-sm text-text-secondary">
          Don&apos;t have an account?{' '}
          <Link
            href={`/register${searchParams.toString() ? `?${searchParams.toString()}` : ''}`}
            className="text-primary hover:underline"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Suspense fallback={<div className="text-text-muted font-mono text-xs uppercase tracking-widest">Loading...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
