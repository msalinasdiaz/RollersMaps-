import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useDemoSession } from '@/contexts/demo-session';
import { toAppActivity, type AppActivity, type PublishedActivityRow } from '@/data/activities';
import { supabase } from '@/lib/supabase';

export type Group = {
  id: string; slug: string; name: string; description: string; city: string; logo_url: string | null;
  join_policy: 'open' | 'approval'; member_count: number;
  approval_status?: 'approved' | 'pending' | 'rejected'; approval_expires_at?: string | null;
  membership_status: 'active' | 'pending' | 'left' | 'blocked' | 'rejected' | null;
  membership_role: 'owner' | 'admin' | 'member' | null;
};
type Community = { adminError: string | null; isPlatformAdmin: boolean; groups: Group[]; activities: AppActivity[]; isLoading: boolean; groupsError: string | null; calendarError: string | null; refresh: () => Promise<void> };
const CommunityContext = createContext<Community | null>(null);
const emptyData = { adminError: null as string | null, isPlatformAdmin: false, groups: [] as Group[], activities: [] as AppActivity[], groupsError: null as string | null, calendarError: null as string | null };

export function CommunityProvider({ children }: { children: ReactNode }) {
  const { user, registrationVersion, isLoading: authLoading } = useDemoSession();
  const identity = user?.id ?? 'guest';
  const sequence = useRef(0);
  const [state, setState] = useState({ ...emptyData, identity: '', isLoading: true });
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    if (identity === 'guest') {
      setState({ ...emptyData, identity, isLoading: false });
      return;
    }
    setState((previous) => ({ ...(previous.identity === identity ? previous : emptyData), identity, isLoading: true }));
    try {
      const [groups, calendar, platformAdmin] = await Promise.all([
        supabase.rpc('get_groups'),
        identity !== 'guest' ? supabase.rpc('get_group_calendar') : Promise.resolve({ data: [], error: null }),
        supabase.rpc('is_platform_admin'),
      ]);
      if (request !== sequence.current) return;
      setState({ identity, isLoading: false, adminError: platformAdmin.error ? 'No pudimos comprobar tus permisos de administración. Revisa tu conexión y reintenta.' : null, isPlatformAdmin: !platformAdmin.error && platformAdmin.data === true,
        groups: groups.error ? [] : (groups.data ?? []) as Group[],
        activities: calendar.error ? [] : ((calendar.data ?? []) as PublishedActivityRow[]).map(toAppActivity),
        groupsError: groups.error ? 'No pudimos cargar los grupos. Revisa tu conexión e inténtalo nuevamente.' : null,
        calendarError: calendar.error ? 'No pudimos cargar tu calendario. Revisa tu conexión e inténtalo nuevamente.' : null,
      });
    } catch {
      if (request === sequence.current) setState({ ...emptyData, identity, isLoading: false, adminError: 'No pudimos comprobar tus permisos. Revisa tu conexión y reintenta.', groupsError: 'No hay conexión con los grupos.', calendarError: 'No hay conexión con el calendario.' });
    }
  }, [identity]);
  useEffect(() => {
    if (authLoading || identity === 'guest') return;
    const timeout = setTimeout(() => { void refresh(); }, 0);
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
      else { ++sequence.current; setState(previous => ({ ...previous, activities: [], isLoading: true })); }
    });
    const interval = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 60_000);
    const requestSequence = sequence;
    return () => { ++requestSequence.current; clearTimeout(timeout); clearInterval(interval); listener.remove(); };
  }, [authLoading, identity, refresh, registrationVersion]);
  const visible = identity === 'guest' ? { ...emptyData, isLoading: false } : state.identity === identity ? state : { ...emptyData, isLoading: true };
  return <CommunityContext.Provider value={{ ...visible, refresh }}>{children}</CommunityContext.Provider>;
}
export function useCommunity() {
  const value = useContext(CommunityContext);
  if (!value) throw new Error('CommunityProvider requerido.');
  return value;
}
