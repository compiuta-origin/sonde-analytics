import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from './env';

// Singleton instance for browser
let browserClient: SupabaseClient | null = null;

// Client-side Supabase client (singleton)
export const createBrowserClient = () => {
  if (browserClient) {
    return browserClient;
  }

  const supabaseUrl = getEnv('SUPABASE_PUBLIC_URL');
  const supabaseAnonKey = getEnv('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing SUPABASE_PUBLIC_URL or SUPABASE_ANON_KEY in runtime environment.',
    );
  }

  browserClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'sb-localhost-auth-token',
    },
  });

  return browserClient;
};
