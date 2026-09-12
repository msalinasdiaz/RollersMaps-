import { useCallback, useEffect, useState } from 'react';

import { useDemoSession } from '@/contexts/demo-session';
import { supabase } from '@/lib/supabase';

export type UserActivity = {
  activityType: 'group_activity' | 'free_route' | 'guided_route';
  averageSpeedKmh: number;
  distanceKm: number;
  durationSeconds: number;
  endedAt: Date;
  groupActivityId: string | null;
  id: string;
  route: { latitude: number; longitude: number }[];
  startedAt: Date;
  syncStatus: 'not_connected' | 'pending' | 'synced' | 'error';
  title: string;
};

type UserActivityRow = {
  activity_type: UserActivity['activityType'];
  average_speed_kmh: number | string;
  distance_km: number | string;
  duration_seconds: number;
  ended_at: string;
  group_activity_id: string | null;
  id: string;
  route_geojson: unknown;
  started_at: string;
  sync_status: UserActivity['syncStatus'];
  title: string;
};

function parseRoute(value: unknown): UserActivity['route'] {
  if (!value || typeof value !== 'object' || !('coordinates' in value)) {
    return [];
  }

  const coordinates = (value as { coordinates?: unknown }).coordinates;
  if (!Array.isArray(coordinates)) {
    return [];
  }

  return coordinates.flatMap((coordinate) => (
    Array.isArray(coordinate)
      && typeof coordinate[0] === 'number'
      && typeof coordinate[1] === 'number'
      ? [{ latitude: coordinate[1], longitude: coordinate[0] }]
      : []
  ));
}

export function useUserActivities(enabled = true) {
  const { recordedActivityVersion, user } = useDemoSession();
  const [activities, setActivities] = useState<UserActivity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadActivities = useCallback(async () => {
    if (!user) {
      return;
    }

    const { data, error: requestError } = await supabase
      .from('user_activities')
      .select('id, title, activity_type, group_activity_id, started_at, ended_at, duration_seconds, distance_km, average_speed_kmh, route_geojson, sync_status')
      .eq('user_id', user.id)
      .order('started_at', { ascending: false })
      .limit(100);

    if (requestError) {
      setActivities([]);
      setError(requestError.message);
      setIsLoading(false);
      return;
    }

    const rows = (data ?? []) as UserActivityRow[];
    setActivities(rows.map((activity) => ({
      activityType: activity.activity_type,
      averageSpeedKmh: Number(activity.average_speed_kmh),
      distanceKm: Number(activity.distance_km),
      durationSeconds: activity.duration_seconds,
      endedAt: new Date(activity.ended_at),
      groupActivityId: activity.group_activity_id,
      id: activity.id,
      route: parseRoute(activity.route_geojson),
      startedAt: new Date(activity.started_at),
      syncStatus: activity.sync_status,
      title: activity.title,
    })));
    setError(null);
    setIsLoading(false);
  }, [user]);

  const renameActivity = useCallback(async (activityId: string, title: string) => {
    const cleanTitle = title.trim();
    if (!user || cleanTitle.length < 3 || cleanTitle.length > 60) {
      return 'El nombre debe tener entre 3 y 60 caracteres.';
    }

    const { error: updateError } = await supabase
      .from('user_activities')
      .update({ title: cleanTitle })
      .eq('id', activityId)
      .eq('user_id', user.id);

    if (updateError) {
      return updateError.message;
    }

    setActivities((current) => current.map((activity) => (
      activity.id === activityId ? { ...activity, title: cleanTitle } : activity
    )));
    return null;
  }, [user]);

  useEffect(() => {
    if (!enabled || !user) {
      return;
    }

    const timeoutId = setTimeout(() => {
      void loadActivities();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [enabled, loadActivities, recordedActivityVersion, user]);

  return { activities, error, isLoading, refresh: loadActivities, renameActivity };
}
