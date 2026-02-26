'use client';

import { Button } from '@/components/ui/button';
import { createBrowserClient } from '@/lib/supabase';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createBrowserClient();
  const [user, setUser] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Only fetch user once on mount
    if (loaded) return;

    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);
      setLoaded(true);
    };

    getUser();
  }, [loaded, supabase]);

  useEffect(() => {
    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  // Don't show navbar on login/register pages
  if (pathname === '/login' || pathname === '/register') {
    return null;
  }

  return (
    <nav className="border-b border-border-subtle bg-canvas">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href={user ? '/dashboard' : '/'}>
              <span className="text-lg font-semibold font-mono tracking-tight text-primary uppercase">
                Sonde
              </span>
            </Link>
          </div>

          {user && (
            <div className="flex items-center gap-6 text-sm text-text-secondary">
              <Link
                href="/dashboard"
                className={`transition-colors hover:text-primary ${
                  pathname === '/dashboard'
                    ? 'text-[var(--brand-amber)] font-medium'
                    : ''
                }`}
              >
                Dashboard
              </Link>
              <Link
                href="/prompts"
                className={`transition-colors hover:text-primary ${
                  pathname.startsWith('/prompts')
                    ? 'text-[var(--brand-amber)] font-medium'
                    : ''
                }`}
              >
                Prompts
              </Link>
              <Link
                href="/logs"
                className={`transition-colors hover:text-primary ${
                  pathname.startsWith('/logs')
                    ? 'text-[var(--brand-amber)] font-medium'
                    : ''
                }`}
              >
                Logs
              </Link>
              <Link
                href="/settings"
                className={`transition-colors hover:text-primary ${
                  pathname.startsWith('/settings')
                    ? 'text-[var(--brand-amber)] font-medium'
                    : ''
                }`}
              >
                Settings
              </Link>
              <div className="border-l border-border-subtle pl-6 flex items-center gap-4">
                <span className="font-mono text-xs text-text-muted">
                  {user.email}
                </span>
                <Button
                  onClick={handleSignOut}
                  variant="secondary"
                  size="sm"
                  className="text-xs"
                >
                  Sign Out
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
