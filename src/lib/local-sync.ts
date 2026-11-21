import { topSpeedsKmh } from './maximum-speed';
import { routeGeometry } from '@/lib/route-geometry';
import { supabase } from '@/lib/supabase';
import { withRequestTimeout } from '@/lib/async-request';
import { deleteLocalActivityAsync, claimLocalActivityAsync, getPendingLocalActivitiesAsync, markLocalActivitySyncedAsync, GUEST_OWNER } from '@/lib/tracking-store';

const inFlight = new Map<string, { includeGuests: boolean; promise: Promise<string | null> }>();
const SESSION_CHANGED = 'La sesión cambió. Tus recorridos siguen guardados en este teléfono.';
const SYNC_FAILED = 'No pudimos respaldar en la nube. Tus recorridos siguen guardados en este teléfono.';
const BATCH_SIZE = 20;
export function syncLocalActivities(userId: string, includeGuests = false): Promise<string | null> {
  const existing = inFlight.get(userId);
  if (existing) {
    if (includeGuests && !existing.includeGuests) return existing.promise.then(error => error ?? syncLocalActivities(userId, true));
    return existing.promise;
  }
  const promise = queueHistoryChange(userId, () => sync(userId, includeGuests)).catch(() => SYNC_FAILED).finally(() => inFlight.delete(userId));
  inFlight.set(userId, { includeGuests, promise }); return promise;
}
// A pending upload must finish before the same record can be deleted.
const historyQueues = new Map<string, Promise<void>>();
function queueHistoryChange<T>(owner: string, work: () => Promise<T>): Promise<T> {
  const result = (historyQueues.get(owner) ?? Promise.resolve()).then(work);
  const tail = result.then(() => {}, () => {});
  historyQueues.set(owner, tail);
  void tail.then(() => { if (historyQueues.get(owner) === tail) historyQueues.delete(owner); });
  return result;
}

export function deleteRecordedRoute(owner: string, activity: { localId?: string; cloudId?: string | null }) {
  return queueHistoryChange(owner, async () => {
    const id = activity.cloudId || activity.localId;
    if (!id || owner === GUEST_OWNER || !await hasSession(owner)) throw new Error(SESSION_CHANGED);
    // Even a pending record may have reached the server before a lost acknowledgement.
    const result = await withRequestTimeout(signal => supabase.from('user_activities').delete()
      .eq('user_id', owner).eq(activity.cloudId ? 'id' : 'client_record_id', id).abortSignal(signal));
    if (result.error) throw result.error;
    await deleteLocalActivityAsync(owner, activity.localId ?? null, activity.cloudId ?? null);
  });
}

function retryable(error: { code?: string; message?: string } | null, status?: number) {
  if (status === 429 || (status != null && status >= 500)) return true;
  if (error?.code && error.code !== 'PGRST000') return false;
  return status === 0 || /offline|fetch|network|conexión|timeout|abort/i.test(error?.message ?? '');
}
async function hasSession(userId: string) {
  const result = await withRequestTimeout(() => supabase.auth.getSession());
  return !result.error && result.data.session?.user.id === userId;
}
async function sync(userId: string, includeGuests: boolean): Promise<string | null> {
  if (!userId.trim() || userId === GUEST_OWNER) return SESSION_CHANGED;
  const processed = new Set<string>();
  for (;;) {
    // The SQL queue excludes synced snapshots before their geometry is parsed.
    const pending = await getPendingLocalActivitiesAsync(userId, includeGuests, BATCH_SIZE);
    const records = pending.filter(r => !processed.has(r.snapshot.recordId) && !r.cloudId && (r.ownerId === userId || includeGuests && r.ownerId === GUEST_OWNER));
    if (!records.length) return null;
    for (const record of records) {
      if (!await hasSession(userId)) return SESSION_CHANGED;
      if (record.ownerId === GUEST_OWNER) await claimLocalActivityAsync(record.snapshot.recordId, userId);
      const s = record.snapshot;
      const geometry = routeGeometry(s.route);
      const peaks = topSpeedsKmh(s.route);
      const payload = { user_id: userId, client_record_id: s.recordId, title: s.title, activity_type: s.activityType,
        group_activity_id: s.groupActivityId, started_at: new Date(s.startedAt).toISOString(),
        ended_at: new Date(s.endedAt ?? s.startedAt).toISOString(), duration_seconds: s.durationSeconds,
        distance_km: s.distanceKm, average_speed_kmh: s.averageSpeedKmh, source: 'rollersmaps', sync_status: 'not_connected', route_geojson: geometry && peaks.length ? { ...geometry, maximumSpeedKmh: peaks[0], topSpeedsKmh: peaks } : geometry };
      let cloudId: string | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt) {
          await new Promise(resolve => setTimeout(resolve, 250 * 2 ** (attempt - 1)));
          if (!await hasSession(userId)) return SESSION_CHANGED;
        }
        try {
          const response = await withRequestTimeout(signal => supabase.from('user_activities')
            .upsert(payload, { onConflict: 'user_id,client_record_id' }).select('id').abortSignal(signal).single());
          if (!response.error && response.data?.id) { cloudId = response.data.id; break; }
          if (!retryable(response.error, response.status)) return SYNC_FAILED;
        } catch (error) {
          if (!(error instanceof Error) || !/timeout|solicitud tardó|fetch|network|abort/i.test(error.message)) return SYNC_FAILED;
        }
      }
      if (!cloudId) return SYNC_FAILED;
      if (!await hasSession(userId)) return SESSION_CHANGED;
      await markLocalActivitySyncedAsync(s.recordId, userId, cloudId); processed.add(s.recordId);
    }
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}
