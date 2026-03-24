'use client';

import { useToast } from '@/components/providers/toast-provider';
import { createBrowserClient } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  useCallback,
  createContext,
  Suspense,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

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
  const { success: showSuccess, info: showInfo } = useToast();

  // Create Supabase client only once
  const supabase = useMemo(() => createBrowserClient(), []);
  const finalizedReferralUsers = useRef<Set<string>>(new Set());
  const finalizingReferralUsers = useRef<Set<string>>(new Set());

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState(false);

  const next = searchParams.get('next') || '/dashboard';
  const redirectPath = next.startsWith('/') ? next : `/${next}`;

  const finalizeReferral = useCallback(
    async (userId: string | null | undefined) => {
      if (
        !userId ||
        finalizedReferralUsers.current.has(userId) ||
        finalizingReferralUsers.current.has(userId)
      ) {
        return;
      }

      finalizingReferralUsers.current.add(userId);

      try {
        const { data, error } = await supabase.rpc('finalize_referral_signup');
        if (error) {
          console.error('Error finalizing referral signup:', error);
          finalizingReferralUsers.current.delete(userId);
          return;
        }

        finalizedReferralUsers.current.add(userId);
        finalizingReferralUsers.current.delete(userId);

        const result =
          data && typeof data === 'object' && !Array.isArray(data)
            ? data
            : null;

        if (!result) return;

        if (result.awarded) {
          showSuccess(
            'Referral applied. Your monthly credit allowance increased by 1.',
          );
          return;
        }

        if (result.reason === 'invalid') {
          showInfo(
            'The referral code on this signup was invalid, so no referral credits were applied.',
          );
        } else if (result.reason === 'self') {
          showInfo('You cannot use your own referral code.');
        }
      } catch (err) {
        console.error('Unexpected error finalizing referral signup:', err);
        finalizingReferralUsers.current.delete(userId);
      }
    },
    [showInfo, showSuccess, supabase],
  );

  useEffect(() => {
    // Only check auth once on mount
    if (checked) return;

    const checkAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setUser(session?.user ?? null);

      if (session?.user?.id) {
        void finalizeReferral(session.user.id);
      }

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
  }, [checked, finalizeReferral, pathname, router, supabase, redirectPath]);

  useEffect(() => {
    // Listen for auth changes (sign in/out)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);

      if (event === 'SIGNED_OUT') {
        finalizedReferralUsers.current.clear();
        finalizingReferralUsers.current.clear();
        router.replace('/login');
      } else if (
        event === 'SIGNED_IN' &&
        (pathname === '/login' || pathname === '/register')
      ) {
        if (session?.user?.id) {
          void finalizeReferral(session.user.id);
        }
        router.replace(redirectPath);
      } else if (event === 'SIGNED_IN' && session?.user?.id) {
        void finalizeReferral(session.user.id);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [finalizeReferral, pathname, router, supabase, redirectPath]);

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
