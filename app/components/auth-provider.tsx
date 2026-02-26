'use client';

import { createBrowserClient } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { createContext, Suspense, useContext, useEffect, useMemo, useState } from 'react';

const PUBLIC_ROUTES = ['/', '/login', '/register', '/test'];

type SupabaseContext = {
  supabase: SupabaseClient;
  user: any;
};

const Context = createContext<SupabaseContext | undefined>(undefined);

function AuthHandler({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Create Supabase client only once
  const supabase = useMemo(() => createBrowserClient(), []);

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState(false);

  const next = searchParams.get('next') || '/dashboard';
  const redirectPath = next.startsWith('/') ? next : `/${next}`;

  useEffect(() => {
    // Only check auth once on mount
    if (checked) return;

    const checkAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setUser(session?.user ?? null);

      const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

      if (!session && !isPublicRoute) {
        // Preserving redirect if forced to login
        const loginUrl = pathname !== '/'
          ? `/login?next=${encodeURIComponent(pathname)}`
          : '/login';
        router.replace(loginUrl);
      } else if (
        session &&
        (pathname === '/login' || pathname === '/register')
      ) {
        router.replace(redirectPath);
      }

      setLoading(false);
      setChecked(true);
    };

    checkAuth();
  }, [checked, pathname, router, supabase, redirectPath]);

  useEffect(() => {
    // Listen for auth changes (sign in/out)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);

      if (event === 'SIGNED_OUT') {
        router.replace('/login');
      } else if (
        event === 'SIGNED_IN' &&
        (pathname === '/login' || pathname === '/register')
      ) {
        router.replace(redirectPath);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [pathname, router, supabase, redirectPath]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <Context.Provider value={{ supabase, user }}>{children}</Context.Provider>
  );
}

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    }>
      <AuthHandler>{children}</AuthHandler>
    </Suspense>
  );
}

export function useSupabase() {
  const context = useContext(Context);
  if (context === undefined) {
    throw new Error('useSupabase must be used within AuthProvider');
  }
  return context;
}
