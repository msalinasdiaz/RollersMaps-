import { topSpeedsKmh } from '@/lib/maximum-speed';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useDemoSession } from '@/contexts/demo-session';
import { supabase } from '@/lib/supabase';
import { getLegacyActivityCount, getLocalActivityAsync, getLocalActivitySummariesAsync, GUEST_OWNER, recoverGuestActivities, renameLocalActivityAsync } from '@/lib/tracking-store';
import { deleteRecordedRoute, syncLocalActivities } from '@/lib/local-sync';
import { ACTIVITY_PAGE_SIZE, cloudActivityDetail, cloudActivityPage, localActivitySummary, mergeActivitySummaries, type UserActivity, type UserActivitySummary } from '@/lib/activity-history';
import { withRequestTimeout } from '@/lib/async-request';

export type { UserActivity, UserActivitySummary } from '@/lib/activity-history';
type Paging = { localOffset: number; cloudOffset: number; localMore: boolean; cloudMore: boolean };
const initialPaging = (): Paging => ({ localOffset: 0, cloudOffset: 0, localMore: true, cloudMore: true });
type State = { owner: string; activities: UserActivitySummary[]; error: string | null; isLoading: boolean; isLoadingMore: boolean; hasMore: boolean };

export function useUserActivities(enabled = true) {
  const { user, recordedActivityVersion, notifyRecordedActivitySaved } = useDemoSession();
  const owner = user?.id ?? GUEST_OWNER;
  const currentOwner = useRef(owner);
  useLayoutEffect(() => { currentOwner.current = owner; }, [owner]);
  const request = useRef(0), pageBusy = useRef(false), paging = useRef(initialPaging());
  const details = useRef(new Map<string, UserActivity>());
  const renaming = useRef(new Map<string, Promise<string | null>>());
  const [state, setState] = useState<State>({ owner: '', activities: [], error: null, isLoading: true, isLoadingMore: false, hasMore: false });
  const loadPage = useCallback(async (refresh = false) => {
    if (!refresh && pageBusy.current) return;
    const sequence = refresh ? ++request.current : request.current;
    if (refresh) { paging.current = initialPaging(); details.current.clear(); }
    if (owner === GUEST_OWNER) {
      setState({ owner, activities: [], error: null, isLoading: false, isLoadingMore: false, hasMore: false }); return;
    }
    const page = { ...paging.current };
    if (!refresh && !page.localMore && !page.cloudMore) return;
    pageBusy.current = true;
    const active = () => sequence === request.current && currentOwner.current === owner;
    setState(previous => ({ owner, activities: refresh || previous.owner !== owner ? [] : previous.activities,
      error: null, isLoading: refresh, isLoadingMore: !refresh, hasMore: true }));
    let local: UserActivitySummary[] = [], localError = false;
    // Publish the SQLite page before waiting for the concurrent network request.
    const cloudPromise = page.cloudMore ? cloudActivityPage(owner, page.cloudOffset).then(
      data => ({ data, failed: false }), () => ({ data: null, failed: true }),
    ) : Promise.resolve({ data: null, failed: false });
    try {
      if (page.localMore) {
        const records = await getLocalActivitySummariesAsync(owner, { limit: ACTIVITY_PAGE_SIZE + 1, offset: page.localOffset });
        local = records.slice(0, ACTIVITY_PAGE_SIZE).map(localActivitySummary);
        page.localMore = records.length > ACTIVITY_PAGE_SIZE; page.localOffset += ACTIVITY_PAGE_SIZE;
      }
    } catch { localError = true; }
    if (!active()) return;
    setState(previous => ({ ...previous, activities: mergeActivitySummaries(previous.activities, local), isLoading: false }));
    const cloud = await cloudPromise;
    if (!active()) return;
    if (cloud.data) { page.cloudMore = cloud.data.hasMore; page.cloudOffset += ACTIVITY_PAGE_SIZE; }
    paging.current = page; pageBusy.current = false;
    setState(previous => ({ owner, activities: mergeActivitySummaries(previous.activities, cloud.data?.activities ?? []),
      error: localError ? 'No pudimos leer parte del historial de este teléfono. Puedes reintentar.' : cloud.failed ? 'No pudimos cargar el respaldo en la nube. Tus recorridos locales siguen disponibles.' : null,
      isLoading: false, isLoadingMore: false, hasMore: page.localMore || page.cloudMore }));
  }, [owner]);
  const refresh = useCallback(() => loadPage(true), [loadPage]);
  const loadMore = useCallback(() => loadPage(false), [loadPage]);
  useFocusEffect(useCallback(() => {
    void recordedActivityVersion; if (enabled) void refresh();
    return () => { ++request.current; pageBusy.current = false; details.current.clear(); };
  }, [enabled, refresh, recordedActivityVersion]));
  const loadDetail = useCallback(async (activity: UserActivitySummary): Promise<UserActivity | null> => {
    const sequence = request.current;
    const cached = details.current.get(activity.id); if (cached) return { ...cached, title: activity.title };
    let detail: UserActivity | null = null;
    if (activity.localId) {
      const local = await getLocalActivityAsync(activity.localId, owner);
      if (local) {
        const peaks = topSpeedsKmh(local.snapshot.route);
        detail = { ...activity, route: local.snapshot.route, maximumSpeedKmh: peaks[0] ?? null, topSpeedsKmh: peaks };
      }
    }
    if (!detail) detail = await cloudActivityDetail(owner, activity);
    if (sequence !== request.current || currentOwner.current !== owner) return null;
    if (detail) {
      if (details.current.size >= 3) details.current.delete(details.current.keys().next().value!);
      details.current.set(activity.id, detail);
    }
    return detail;
  }, [owner]);
  const renameActivity = useCallback((id: string, title: string): Promise<string | null> => {
    const key = owner + ':' + id;
    const existing = renaming.current.get(key); if (existing) return existing;
    const operation = (async () => {
      const clean = title.trim(); if (clean.length < 3 || clean.length > 60) return 'Usa entre 3 y 60 caracteres.';
      const activity = state.owner === owner ? state.activities.find(a => a.id === id) : undefined;
      if (!activity) return 'El recorrido no está disponible.';
      try {
        if (activity.cloudId) {
          const session = await withRequestTimeout(() => supabase.auth.getSession());
          if (session.data.session?.user.id !== owner || currentOwner.current !== owner) return 'La sesión cambió. Vuelve a ingresar para renombrar.';
          const response = await withRequestTimeout(signal => supabase.from('user_activities').update({ title: clean })
            .eq('id', activity.cloudId!).eq('user_id', owner).select('id').abortSignal(signal).maybeSingle());
          if (response.error || !response.data) return 'No pudimos actualizar el nombre. Revisa tu conexión.';
        }
        if (currentOwner.current !== owner) return 'La sesión cambió. Vuelve a ingresar.';
        if (activity.localId) await renameLocalActivityAsync(activity.localId, owner, clean);
        details.current.delete(id);
        setState(previous => previous.owner === owner ? { ...previous, activities: previous.activities.map(a => a.id === id ? { ...a, title: clean } : a) } : previous);
        notifyRecordedActivitySaved(); return null;
      } catch { return 'No pudimos actualizar el nombre. Tu recorrido sigue guardado.'; }
    })().finally(() => renaming.current.delete(key));
    renaming.current.set(key, operation); return operation;
  }, [state, owner, notifyRecordedActivitySaved]);
  const deleteActivity = async (activity: UserActivitySummary) => {
    await deleteRecordedRoute(owner, activity);
    if (currentOwner.current === owner) {
      details.current.delete(activity.id);
      notifyRecordedActivitySaved();
      await refresh();
    }
  };
  const sync = useCallback(async () => {
    if (!user) return 'Inicia sesión para respaldar tus recorridos.';
    try { const error = await syncLocalActivities(user.id); notifyRecordedActivitySaved(); await refresh(); return error; }
    catch { return 'No pudimos respaldar. Tus recorridos siguen en este teléfono.'; }
  }, [user, notifyRecordedActivitySaved, refresh]);
  const legacyCount = useMemo(() => { void recordedActivityVersion; return user ? getLegacyActivityCount() : 0; }, [user, recordedActivityVersion]);
  const recoverLegacy = useCallback(() => { if (user) { recoverGuestActivities(user.id); notifyRecordedActivitySaved(); } }, [user, notifyRecordedActivitySaved]);
  const visible = state.owner === owner ? state : { owner, activities: [], error: null, isLoading: true, isLoadingMore: false, hasMore: false };
  return { ...visible, legacyCount, recoverLegacy, refresh, loadMore, loadDetail, renameActivity, deleteActivity, sync };
}
