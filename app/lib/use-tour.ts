'use client';

import { useSupabase } from '@/components/auth-provider';
import { useEffect, useState } from 'react';

export function useTour() {
  const { supabase, user } = useSupabase();
  const [tourCompleted, setTourCompleted] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) {
      setTourCompleted(null);
      return;
    }

    supabase
      .from('profiles')
      .select('tour_completed')
      .eq('id', user.id)
      .single()
      .then(({ data, error }) => {
        if (error) {
          // If column doesn't exist yet, treat as not completed
          setTourCompleted(false);
          return;
        }
        setTourCompleted(data?.tour_completed ?? false);
      });
  }, [user, supabase]);

  const completeTour = async () => {
    if (!user) return;
    setTourCompleted(true);
    await supabase
      .from('profiles')
      .update({ tour_completed: true })
      .eq('id', user.id);
  };

  return { tourCompleted, completeTour };
}
