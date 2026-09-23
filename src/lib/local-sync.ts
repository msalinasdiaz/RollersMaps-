import { routeGeometry } from '@/lib/route-geometry';
import { supabase } from '@/lib/supabase';
import { claimLocalActivity, getLocalActivities, markLocalActivitySynced, GUEST_OWNER } from '@/lib/tracking-store';

const inFlight = new Map<string, Promise<string | null>>();
export function syncLocalActivities(userId: string, includeGuests = false): Promise<string | null> {
  const key = userId + ':' + includeGuests;
  const existing = inFlight.get(key);
  if (existing) return existing;
  const pending = sync(userId, includeGuests).finally(() => { inFlight.delete(key); });
  inFlight.set(key, pending);
  return pending;
}
async function sync(userId: string, includeGuests: boolean): Promise<string | null> {
  for (const record of getLocalActivities(userId, includeGuests)) {
    if (record.cloudId || (record.ownerId === GUEST_OWNER && !includeGuests)) continue;
    // Identity is rechecked before each write; a changed account never claims these routes.
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user.id !== userId) return 'La sesión cambió. Tus recorridos siguen guardados en este teléfono.';
    if (record.ownerId === GUEST_OWNER) claimLocalActivity(record.snapshot.recordId, userId);
    const s = record.snapshot;
    const { data, error } = await supabase.from('user_activities').upsert({
      user_id: userId, client_record_id: s.recordId, title: s.title, activity_type: s.activityType,
      group_activity_id: s.groupActivityId, started_at: new Date(s.startedAt).toISOString(),
      ended_at: new Date(s.endedAt ?? s.startedAt).toISOString(), duration_seconds: s.durationSeconds,
      distance_km: s.distanceKm, average_speed_kmh: s.averageSpeedKmh, source: 'rollersmaps', sync_status: 'not_connected',
      route_geojson: routeGeometry(s.route),
    }, { onConflict: 'user_id,client_record_id' }).select('id').single();
    if (error || !data) return 'No pudimos respaldar en la nube. Tus recorridos siguen guardados en este teléfono.';
    markLocalActivitySynced(s.recordId, userId, data.id);
  }
  return null;
}
