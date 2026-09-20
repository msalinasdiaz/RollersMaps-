import { type Session, type User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { AppState, Alert } from 'react-native';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { getTrackingSnapshot } from '@/lib/tracking-store';
import { supabase } from '@/lib/supabase';

type Profile = {
  comuna: string | null;
  displayName: string | null;
  skillLevel: string | null;
};

type SignUpResult = {
  confirmationSent: boolean;
  error: string | null;
};

type DemoSessionValue = {
  isLoading: boolean;
  isSignedIn: boolean;
  isJoined: (activityId: string) => boolean;
  notifyRecordedActivitySaved: () => void;
  profile: Profile | null;
  recordedActivityVersion: number;
  registrationVersion: number;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  signUp: (displayName: string, email: string, password: string) => Promise<SignUpResult>;
  toggleActivity: (activityId: string) => Promise<void>;
  user: User | null;
};

const DemoSessionContext = createContext<DemoSessionValue | null>(null);

function userFacingError(message: string) {
  const normalized = message.toLocaleLowerCase();

  if (normalized.includes('no quedan cupos')) {
    return 'Esta actividad ya no tiene cupos disponibles.';
  }

  if (normalized.includes('invalid login credentials')) {
    return 'Revisa tu correo y contraseña e inténtalo de nuevo.';
  }

  if (normalized.includes('email not confirmed')) {
    return 'Confirma el correo que te enviamos antes de ingresar.';
  }

  return message;
}

export function DemoSessionProvider({ children }: { children: ReactNode }) {
  const accountRequest = useRef(0);
  const busyRegistrations = useRef(new Set<string>());
  const [isLoading, setIsLoading] = useState(true);
  const [joinedActivityIds, setJoinedActivityIds] = useState<string[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [recordedActivityVersion, setRecordedActivityVersion] = useState(0);
  const [registrationVersion, setRegistrationVersion] = useState(0);
  const [session, setSession] = useState<Session | null>(null);

  const loadAccountData = useCallback(async (userId: string | undefined) => {
    const request = ++accountRequest.current;
    setJoinedActivityIds([]);
    setProfile(null);
    if (!userId) {
      setJoinedActivityIds([]);
      setProfile(null);
      return;
    }

    const [profileResult, registrationsResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('display_name, skill_level, comuna')
        .eq('id', userId)
        .maybeSingle(),
      supabase
        .from('registrations')
        .select('activity_id')
        .eq('user_id', userId)
        .eq('status', 'registered'),
    ]);

    if (request !== accountRequest.current) return;
    if (profileResult.data) {
      setProfile({
        comuna: profileResult.data.comuna,
        displayName: profileResult.data.display_name,
        skillLevel: profileResult.data.skill_level,
      });
    } else {
      setProfile(null);
    }

    if (registrationsResult.data) {
      setJoinedActivityIds(registrationsResult.data.map((registration) => registration.activity_id));
    }
  }, []);

  const applySession = useCallback((nextSession: Session | null) => {
    setSession(nextSession);
    void loadAccountData(nextSession?.user.id);
  }, [loadAccountData]);

  const handleAuthUrl = useCallback(async (url: string) => {
    const parsedUrl = new URL(url);
    const code = parsedUrl.searchParams.get('code');

    if (code) {
      await supabase.auth.exchangeCodeForSession(code);
      return;
    }

    const hashParameters = new URLSearchParams(parsedUrl.hash.replace(/^#/, ''));
    const accessToken = hashParameters.get('access_token');
    const refreshToken = hashParameters.get('refresh_token');

    if (accessToken && refreshToken) {
      await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    void supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      if (isMounted) {
        applySession(currentSession);
        setIsLoading(false);
      }
    });

    const authSubscription = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setTimeout(() => applySession(nextSession), 0);
      setIsLoading(false);
    });
    const linkSubscription = Linking.addEventListener('url', ({ url }) => {
      void handleAuthUrl(url);
    });
    const appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    });

    void Linking.getInitialURL().then((url) => {
      if (url) {
        void handleAuthUrl(url);
      }
    });

    return () => {
      isMounted = false;
      authSubscription.data.subscription.unsubscribe();
      linkSubscription.remove();
      appStateSubscription.remove();
    };
  }, [applySession, handleAuthUrl]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    return error ? userFacingError(error.message) : null;
  }, []);

  const signUp = useCallback(async (displayName: string, email: string, password: string): Promise<SignUpResult> => {
    const redirectTo = Linking.createURL('');
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: { display_name: displayName.trim() },
        emailRedirectTo: redirectTo,
      },
    });

    return {
      confirmationSent: !data.session,
      error: error ? userFacingError(error.message) : null,
    };
  }, []);

  const signOut = useCallback(async () => {
    if (getTrackingSnapshot()?.status === 'active') { Alert.alert('Ruta en curso', 'Finaliza tu recorrido antes de cerrar la sesión.'); return; }
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert('No pudimos cerrar la sesión', userFacingError(error.message));
    }
  }, []);

  const toggleActivity = useCallback(async (activityId: string) => {
    if (busyRegistrations.current.has(activityId)) return;
    busyRegistrations.current.add(activityId);
    try {
    const isCancelling = joinedActivityIds.includes(activityId);
    const result = isCancelling
      ? await supabase.rpc('cancel_registration', { p_activity_id: activityId })
      : await supabase.rpc('register_for_activity', { p_activity_id: activityId });

    if (result.error) {
      Alert.alert(
        isCancelling ? 'No pudimos cancelar la inscripción' : 'No pudimos completar la inscripción',
        userFacingError(result.error.message),
      );
      return;
    }

    setJoinedActivityIds((current) => (
      isCancelling
        ? current.filter((id) => id !== activityId)
        : [...current, activityId]
    ));
    setRegistrationVersion((current) => current + 1);

    if (!isCancelling) {
      Alert.alert(
        '¡Ojo! Casco obligatorio',
        'Recuerda que el uso de casco es obligatorio en todas nuestras actividades. Sin él, NO podrás participar en nuestras actividades.',
        [{ text: 'Entendido' }],
      );
    }
    } finally { busyRegistrations.current.delete(activityId); }
  }, [joinedActivityIds]);

  const notifyRecordedActivitySaved = useCallback(() => setRecordedActivityVersion((current) => current + 1), []);
  const value = useMemo<DemoSessionValue>(() => ({
    isJoined: (activityId) => joinedActivityIds.includes(activityId),
    isLoading,
    isSignedIn: Boolean(session),
    notifyRecordedActivitySaved,
    profile,
    recordedActivityVersion,
    registrationVersion,
    signIn,
    signOut,
    signUp,
    toggleActivity,
    user: session?.user ?? null,
  }), [notifyRecordedActivitySaved, isLoading, joinedActivityIds, profile, recordedActivityVersion, registrationVersion, session, signIn, signOut, signUp, toggleActivity]);

  return <DemoSessionContext.Provider value={value}>{children}</DemoSessionContext.Provider>;
}

export function useDemoSession() {
  const context = useContext(DemoSessionContext);

  if (!context) {
    throw new Error('useDemoSession debe utilizarse dentro de DemoSessionProvider.');
  }

  return context;
}
