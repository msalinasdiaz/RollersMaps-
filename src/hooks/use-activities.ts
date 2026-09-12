import { useCallback, useEffect, useState } from 'react';

import { toAppActivity, type AppActivity, type PublishedActivityRow } from '@/data/activities';
import { useDemoSession } from '@/contexts/demo-session';
import { supabase } from '@/lib/supabase';

export function useActivities(enabled = true) {
  const { registrationVersion } = useDemoSession();
  const [activities, setActivities] = useState<AppActivity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadActivities = useCallback(async () => {
    const { data, error: requestError } = await supabase.rpc('get_published_activities');

    if (requestError) {
      setActivities([]);
      setError(requestError.message);
      setIsLoading(false);
      return;
    }

    const rows = (data ?? []) as PublishedActivityRow[];
    setActivities(rows.map(toAppActivity));
    setError(null);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const timeoutId = setTimeout(() => {
      void loadActivities();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [enabled, loadActivities, registrationVersion]);

  return { activities, error, isLoading, refresh: loadActivities };
}
