'use client';

import { useToast } from '@/components/providers/toast-provider';
import { Button } from '@/components/ui/button';
import { createBrowserClient } from '@/lib/supabase';
import { Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

function UpdatePasswordForm() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const supabase = createBrowserClient();
  const { success: showSuccess, error: showError } = useToast();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true);
      }
    });

    // Also check if there's already an active recovery session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setReady(true);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (password !== confirmPassword) {
      showError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      showError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      showError(error.message);
      setLoading(false);
      return;
    }

    await supabase.auth.signOut();
    showSuccess('Password updated successfully. Please sign in with your new password.');
    router.push('/login');
  }

  if (!ready) {
    return (
      <div className="w-full max-w-md bg-surface border border-border-subtle px-6 py-8 rounded-md shadow-none text-center">
        <p className="text-sm text-text-muted font-mono uppercase tracking-widest">
          Verifying reset link...
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md bg-surface border border-border-subtle px-6 py-8 rounded-md shadow-none">
      <h1 className="text-3xl font-semibold tracking-tight text-text-primary">
        Set new password
      </h1>
      <p className="text-sm text-text-secondary mb-6">
        Choose a new password for your account.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label className="block text-xs uppercase tracking-wide text-text-secondary">
            New Password
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
            Confirm New Password
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

        <Button
          type="submit"
          disabled={loading}
          variant="primary"
          className="w-full"
        >
          {loading ? 'Updating...' : 'Update Password'}
        </Button>
      </form>
    </div>
  );
}

export default function UpdatePasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Suspense fallback={<div className="text-text-muted font-mono text-xs uppercase tracking-widest">Loading...</div>}>
        <UpdatePasswordForm />
      </Suspense>
    </div>
  );
}
