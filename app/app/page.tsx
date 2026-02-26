'use client';

import { useSupabase } from '@/components/auth-provider';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function RootPage() {
  const { user } = useSupabase();
  const router = useRouter();

  useEffect(() => {
    // AuthProvider handles the initial loading state and redirects
    // based on session. If we reach this page, we just decide
    // where to send the user based on their auth status.
    if (user) {
      router.replace('/dashboard');
    } else {
      router.replace('/login');
    }
  }, [user, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-pulse text-text-muted font-mono uppercase tracking-widest text-xs">
        Loading Sonde...
      </div>
    </div>
  );
}
