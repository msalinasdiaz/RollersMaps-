import { readMaximumSpeed, readTopSpeeds } from './maximum-speed';
import { hasRouteGeometry, parseRouteGeometry, type RouteCoordinate } from '@/lib/route-geometry';
import { supabase } from '@/lib/supabase';
import type { LocalActivitySummary } from '@/lib/tracking-store';
import { withRequestTimeout } from '@/lib/async-request';

export const ACTIVITY_PAGE_SIZE = 20;
export const ACTIVITY_SUMMARY_COLUMNS = 'id,client_record_id,title,activity_type,group_activity_id,started_at,ended_at,duration_seconds,distance_km,average_speed_kmh';
export type UserActivitySummary = {
  activityType: 'group_activity' | 'free_route' | 'guided_route'; averageSpeedKmh: number;
  distanceKm: number; durationSeconds: number; endedAt: Date; groupActivityId: string | null;
  id: string; localId?: string; cloudId?: string | null; hasRoute: boolean | null;
  startedAt: Date; syncStatus: 'not_connected' | 'pending' | 'synced' | 'error'; title: string;
};
export type UserActivity = UserActivitySummary & { route: RouteCoordinate[]; maximumSpeedKmh?: number | null; topSpeedsKmh?: number[] };
type CloudSummary = {
  id: string; client_record_id: string | null; title: string; activity_type: UserActivitySummary['activityType'];
  group_activity_id: string | null; average_speed_kmh: number; distance_km: number;
  duration_seconds: number; ended_at: string; started_at: string;
};
export function localActivitySummary(s: LocalActivitySummary): UserActivitySummary {
  return { activityType: s.activityType, averageSpeedKmh: s.averageSpeedKmh, distanceKm: s.distanceKm,
    durationSeconds: s.durationSeconds, endedAt: new Date(s.endedAt ?? s.startedAt),
    groupActivityId: s.groupActivityId, id: s.cloudId ?? 'local:' + s.recordId,
    localId: s.recordId, cloudId: s.cloudId, hasRoute: s.hasRoute,
    startedAt: new Date(s.startedAt), syncStatus: s.cloudId ? 'synced' : 'pending', title: s.title };
}
/** Geometry is absent from list pages and fetched only for an opened record. */
export async function cloudActivityPage(ownerId: string, offset: number) {
  const response = await withRequestTimeout(signal => supabase.from('user_activities')
    .select(ACTIVITY_SUMMARY_COLUMNS).eq('user_id', ownerId)
    .order('started_at', { ascending: false }).order('id', { ascending: false })
    .range(offset, offset + ACTIVITY_PAGE_SIZE).abortSignal(signal));
  if (response.error) throw response.error;
  const rows = (response.data ?? []) as CloudSummary[];
  return { hasMore: rows.length > ACTIVITY_PAGE_SIZE,
    activities: rows.slice(0, ACTIVITY_PAGE_SIZE).map((s): UserActivitySummary => ({
      activityType: s.activity_type, averageSpeedKmh: Number(s.average_speed_kmh), distanceKm: Number(s.distance_km),
      durationSeconds: s.duration_seconds, endedAt: new Date(s.ended_at), groupActivityId: s.group_activity_id,
      id: s.id, cloudId: s.id, localId: s.client_record_id ?? undefined, hasRoute: null,
      startedAt: new Date(s.started_at), syncStatus: 'synced', title: s.title,
    })) };
}
export async function cloudActivityDetail(ownerId: string, activity: UserActivitySummary): Promise<UserActivity | null> {
  if (!activity.cloudId) return null;
  const response = await withRequestTimeout(signal => supabase.from('user_activities').select('route_geojson')
    .eq('user_id', ownerId).eq('id', activity.cloudId!).abortSignal(signal).maybeSingle());
  if (response.error) throw response.error;
  if (!response.data) return null;
  const route = parseRouteGeometry(response.data.route_geojson);
  return { ...activity, route, maximumSpeedKmh: readMaximumSpeed(response.data.route_geojson), topSpeedsKmh: readTopSpeeds(response.data.route_geojson), hasRoute: hasRouteGeometry(route) };
}
export function mergeActivitySummaries(...pages: UserActivitySummary[][]): UserActivitySummary[] {
  const merged = new Map<string, UserActivitySummary>();
  const cloudKeys = new Map<string, string>();
  const recordKeys = new Map<string, string>();
  for (const activity of pages.flat()) {
    const localKey = activity.localId ? recordKeys.get(activity.localId) : undefined;
    const cloudKey = activity.cloudId ? cloudKeys.get(activity.cloudId) : undefined;
    const key = cloudKey ?? localKey ?? (activity.localId ? 'record:' + activity.localId : 'cloud:' + activity.id);
    if (localKey && cloudKey && localKey !== cloudKey) {
      const local = merged.get(localKey), cloud = merged.get(cloudKey);
      if (local && cloud) merged.set(key, { ...local, ...cloud, localId: cloud.localId ?? local.localId, hasRoute: cloud.hasRoute ?? local.hasRoute });
      merged.delete(localKey);
      for (const [record, value] of recordKeys) if (value === localKey) recordKeys.set(record, key);
    }
    const previous = merged.get(key);
    const preferred = previous?.cloudId && !activity.cloudId ? previous : activity;
    merged.set(key, { ...preferred, localId: preferred.localId ?? previous?.localId ?? activity.localId,
      hasRoute: preferred.hasRoute ?? previous?.hasRoute ?? activity.hasRoute ?? null });
    const result = merged.get(key)!;
    if (result.localId) recordKeys.set(result.localId, key);
    if (result.cloudId) cloudKeys.set(result.cloudId, key);
  }
  return [...merged.values()].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime() || b.id.localeCompare(a.id));
}
