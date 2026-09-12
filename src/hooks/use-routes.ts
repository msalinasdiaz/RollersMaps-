import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

export type PublishedRoute = {
  description: string | null;
  difficulty: 'baja' | 'media' | 'alta' | null;
  distanceKm: number | null;
  estimatedMinutes: number | null;
  id: string;
  name: string;
  skillLevel: string | null;
};

type RouteRow = {
  description: string | null;
  difficulty: 'baja' | 'media' | 'alta' | null;
  distance_km: number | null;
  estimated_minutes: number | null;
  id: string;
  name: string;
  skill_level: string | null;
};

export function useRoutes() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [routes, setRoutes] = useState<PublishedRoute[]>([]);

  const loadRoutes = useCallback(async () => {
    const { data, error: requestError } = await supabase
      .from('routes')
      .select('id, name, description, skill_level, difficulty, distance_km, estimated_minutes')
      .eq('status', 'published')
      .order('name');

    if (requestError) {
      setRoutes([]);
      setError(requestError.message);
      setIsLoading(false);
      return;
    }

    setRoutes(((data ?? []) as RouteRow[]).map((route) => ({
      description: route.description,
      difficulty: route.difficulty,
      distanceKm: route.distance_km,
      estimatedMinutes: route.estimated_minutes,
      id: route.id,
      name: route.name,
      skillLevel: route.skill_level,
    })));
    setError(null);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadRoutes();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [loadRoutes]);

  return { error, isLoading, refresh: loadRoutes, routes };
}
