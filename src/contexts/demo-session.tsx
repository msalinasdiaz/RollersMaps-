import { type Session, type User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { AppState, Alert } from 'react-native';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { clearLocalUserData, getTrackingSnapshot, pauseLocalTrackingSession } from '@/lib/tracking-store';
import { stopActiveLocationService } from '@/tasks/background-location';
import { AccountDeletionPendingError,getAccountDeletionStatus, requestAccountDeletion } from '@/lib/account';
import { clearStoredAuthSession,supabase } from '@/lib/supabase';
import { registerAccount, resendAccountConfirmation, type SignUpResult } from '@/lib/auth-actions';
import { authErrorMessage } from '@/lib/auth-errors';
import { completeAuthLink, isPasswordRecoveryLink } from '@/lib/auth-links';
import { requestPasswordRecovery, changeRecoveredPassword } from '@/lib/password-recovery';
import { createAuthFlowCoordinator, restoreAuthOnLaunch } from '@/lib/auth-flow-coordinator';

const recoveryUserKey = 'rollersmaps.password-recovery.user';
function readRecoveryUser(): string | null {
  try { return globalThis.localStorage.getItem(recoveryUserKey); } catch { return null; }
}
function rememberRecoveryUser(userId: string | null) {
  try {
    if (userId) globalThis.localStorage.setItem(recoveryUserKey, userId);
    else globalThis.localStorage.removeItem(recoveryUserKey);
  } catch { /* Recovery stays available in memory if storage is unavailable. */ }
}

type Profile = {
  comuna: string | null;
  displayName: string | null;
  skillLevel: string | null;
};

type DemoSessionValue = {
  isLoading: boolean;
  isPasswordRecovery: boolean;
  isRecoveryLoading: boolean;
  requestPasswordReset: (email: string) => Promise<string | null>;
  setRecoveryPassword: (password: string, confirmation: string) => Promise<string | null>;
  cancelPasswordRecovery: () => Promise<string | null>;
  isSignedIn: boolean;
  isJoined: (activityId: string) => boolean;
  notifyRecordedActivitySaved: () => void;
  profile: Profile | null;
  recordedActivityVersion: number;
  registrationVersion: number;
  signIn: (email: string, password: string) => Promise<string | null>;
  resendConfirmation: (email: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  deleteAccount: (confirmation: string) => Promise<void>;
  signUp: (displayName: string, email: string, password: string, acceptedTerms: boolean) => Promise<SignUpResult>;
  toggleActivity: (activityId: string) => Promise<void>;
  user: User | null;
};

const DemoSessionContext = createContext<DemoSessionValue | null>(null);

function userFacingError(message: string) {
  const normalized = message.toLocaleLowerCase();

  if (normalized.includes('no quedan cupos')) {
    return 'Las inscripciones para esta actividad están cerradas.';
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
  const currentUserId = useRef<string | null>(null);
  const pendingRecoveryUser = useRef<string | null>(null);
  const pendingRecoveryLinks = useRef(new Set<string>());
  const authFlow = useRef<ReturnType<typeof createAuthFlowCoordinator> | null>(null);
  if (authFlow.current === null) authFlow.current = createAuthFlowCoordinator();
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [isRecoveryLoading, setIsRecoveryLoading] = useState(false);
  const busyRegistrations = useRef(new Set<string>());
  const [isLoading, setIsLoading] = useState(true);
  const [joinedActivityIds, setJoinedActivityIds] = useState<string[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [recordedActivityVersion, setRecordedActivityVersion] = useState(0);
  const [registrationVersion, setRegistrationVersion] = useState(0);
  const [session, setSession] = useState<Session | null>(null);

  const enqueueAuthOperation = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => (
    authFlow.current!.enqueue(operation)
  ), []);

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
    currentUserId.current = nextSession?.user.id ?? null;
    const userId = nextSession?.user.id;
    const recoveryUser = pendingRecoveryUser.current ?? readRecoveryUser();
    const recovering = Boolean(userId && recoveryUser === userId);
    pendingRecoveryUser.current = recovering ? userId! : null;
    if (!recovering) rememberRecoveryUser(null);
    setIsPasswordRecovery(recovering);
    setSession(nextSession);
    void loadAccountData(nextSession?.user.id).catch(() => {
      // The saved session remains usable when account details cannot load offline.
    });
  }, [loadAccountData]);

  const handleAuthUrl = useCallback((url: string) => {
    const recovery = isPasswordRecoveryLink(url);
    if (recovery) { pendingRecoveryLinks.current.add(url); setIsRecoveryLoading(true); }
    const processLink = async () => {
      try {
      const error = await completeAuthLink(supabase.auth, url, (recoverySession) => {
        pendingRecoveryUser.current = recoverySession.user.id;
        rememberRecoveryUser(recoverySession.user.id);
        applySession(recoverySession);
      }, async (accessToken) => {
        // Validate legacy implicit links before replacing an already signed-in identity.
        const { data, error } = await supabase.auth.getUser(accessToken);
        if (error || !data.user) throw error ?? new Error('Enlace inválido.');
        if (!currentUserId.current || currentUserId.current === data.user.id) return true;
        const accepted=await new Promise<boolean>((resolve) => Alert.alert('Cambiar cuenta', 'Este enlace pertenece a otra cuenta. Una grabación en curso quedará pausada en la cuenta actual. ¿Quieres abrir la otra cuenta?', [
          { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Abrir cuenta', onPress: () => resolve(true) },
        ], { cancelable: true, onDismiss: () => resolve(false) }));
        if(!accepted)return false;
        const previousUser=currentUserId.current;
        if(previousUser){await stopActiveLocationService();const snapshot=getTrackingSnapshot(previousUser);if(snapshot?.userId===previousUser&&snapshot.status==='active')pauseLocalTrackingSession(previousUser);}
        return true;
      });
      if (error) {
        if (recovery) {
          const { data } = await supabase.auth.getSession();
          applySession(data.session);
        }
        Alert.alert(recovery ? 'No pudimos recuperar la cuenta' : 'No pudimos confirmar la cuenta', error);
      }
    } catch (error) {
      Alert.alert('No pudimos abrir el enlace', authErrorMessage(error));
      } finally {
        if (recovery) {
          pendingRecoveryLinks.current.delete(url);
          setIsRecoveryLoading(pendingRecoveryLinks.current.size > 0);
        }
      }
    };
    return authFlow.current!.openLink(url, processLink);
  }, [applySession]);

  useEffect(() => {
    let isMounted = true;
    let isBootstrapped = false;
    let authRevision = 0;
    const latestAuthState: { session: Session | null; hasEvent: boolean } = { session: null, hasEvent: false };

    const authSubscription = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const revision = ++authRevision;
      latestAuthState.session = nextSession;
      latestAuthState.hasEvent = true;
      if (_event === 'PASSWORD_RECOVERY' && nextSession) {
        pendingRecoveryUser.current = nextSession.user.id;
        rememberRecoveryUser(nextSession.user.id);
      }
      setTimeout(() => {
        if (!isMounted || !isBootstrapped || revision !== authRevision || pendingRecoveryLinks.current.size > 0) return;
        applySession(nextSession);
        setIsLoading(false);
      }, 0);
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

    // A cold start must finish opening its link before regular navigation is shown.
    void (async () => {
      try {
        await restoreAuthOnLaunch(Linking.getInitialURL, async (url) => {
          if (isMounted) await handleAuthUrl(url);
        }, async () => {
          if (!isMounted) return;
          const revision = authRevision;
          const { data } = await supabase.auth.getSession();
          if (!isMounted) return;
          const currentSession = revision !== authRevision && latestAuthState.hasEvent ? latestAuthState.session : data.session;
          if (pendingRecoveryLinks.current.size === 0) applySession(currentSession);
        });
      } catch {
        if (isMounted && latestAuthState.hasEvent && pendingRecoveryLinks.current.size === 0) applySession(latestAuthState.session);
      } finally {
        isBootstrapped = true;
        if (isMounted) setIsLoading(false);
      }
    })();

    return () => {
      isMounted = false;
      authSubscription.data.subscription.unsubscribe();
      linkSubscription.remove();
      appStateSubscription.remove();
    };
  }, [applySession, handleAuthUrl]);

  const signIn = useCallback((email: string, password: string) => enqueueAuthOperation(async () => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      return error ? authErrorMessage(error) : null;
    } catch (error) {
      return authErrorMessage(error);
    }
  }), [enqueueAuthOperation]);

  const signUp = useCallback((displayName: string, email: string, password: string, acceptedTerms: boolean): Promise<SignUpResult> => (
    enqueueAuthOperation(() => registerAccount(supabase.auth, displayName, email, password, Linking.createURL(''), acceptedTerms))
  ), [enqueueAuthOperation]);

  const resendConfirmation = useCallback((email: string) => (
    resendAccountConfirmation(supabase.auth, email, Linking.createURL(''))
  ), []);

  const requestPasswordReset = useCallback((email: string) => (
    requestPasswordRecovery(supabase.auth, email, Linking.createURL('reset-password'))
  ), []);

  const setRecoveryPassword = useCallback(async (password: string, confirmation: string) => {
    if (!isPasswordRecovery || !session) return 'Abre el enlace de recuperación que llegó a tu correo para cambiar la contraseña.';
    const recoveryUser = session.user.id;
    return enqueueAuthOperation(async () => {
      if (pendingRecoveryUser.current !== recoveryUser) return 'Abre el enlace de recuperación más reciente antes de cambiar la contraseña.';
      const error = await changeRecoveredPassword(supabase.auth, password, confirmation);
      if (!error && pendingRecoveryUser.current === recoveryUser) {
        pendingRecoveryUser.current = null;
        rememberRecoveryUser(null);
        setIsPasswordRecovery(false);
      }
      return error;
    });
  }, [isPasswordRecovery, session, enqueueAuthOperation]);

  const cancelPasswordRecovery = useCallback(async () => {
    const recoveryUser = session?.user.id;
    return enqueueAuthOperation(async () => {
    if (recoveryUser && pendingRecoveryUser.current !== recoveryUser) return 'Se abrió otro enlace de recuperación. Vuelve a intentarlo desde la pantalla actual.';
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) return authErrorMessage(error);
      pendingRecoveryUser.current = null;
      rememberRecoveryUser(null);
      applySession(null);
      return null;
    } catch (error) { return authErrorMessage(error); }
    });
  }, [applySession, session, enqueueAuthOperation]);

  const signOut = useCallback(() => enqueueAuthOperation(async () => {
    if (getTrackingSnapshot()?.status === 'active') { Alert.alert('Ruta en curso', 'Finaliza tu recorrido antes de cerrar la sesión.'); return; }
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert('No pudimos cerrar la sesión', userFacingError(error.message));
    }
  }), [enqueueAuthOperation]);

  const deleteAccount = useCallback((confirmation: string) => enqueueAuthOperation(async () => {
    const userId = currentUserId.current;
    if (!userId) throw new Error('Inicia sesión para eliminar tu cuenta.');
    const status = await getAccountDeletionStatus();
    if (status.owned_groups.length) throw new Error('Transfiere primero los grupos de los que eres dueño.');
    await stopActiveLocationService();
    const snapshot = getTrackingSnapshot(userId);
    if (snapshot?.userId === userId && snapshot.status === 'active') pauseLocalTrackingSession(userId);
    let pendingMessage:string|null=null;
    try{await requestAccountDeletion(confirmation);}catch(error){if(!(error instanceof AccountDeletionPendingError))throw error;pendingMessage=error.message;}
    let cleanupFailed = false;
    try { await clearLocalUserData(userId); } catch { cleanupFailed = true; }
    rememberRecoveryUser(null); pendingRecoveryUser.current = null;
    try { const result = await supabase.auth.signOut({ scope: 'local' }); if (result.error) cleanupFailed = true; } catch { cleanupFailed = true; }
    try{await clearStoredAuthSession();}catch{cleanupFailed=true;}
    applySession(null);
    Alert.alert(pendingMessage?'Eliminación en proceso':'Cuenta eliminada',pendingMessage?(pendingMessage+(cleanupFailed?' No pudimos limpiar todos los datos de este teléfono: borra los datos de la app o desinstálala.':'')):cleanupFailed ? 'La cuenta fue eliminada. No pudimos limpiar todos los datos de este teléfono: borra los datos de la app o desinstálala.' : 'Retiramos tu cuenta y sus datos.');
  }), [applySession, enqueueAuthOperation]);

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
    isPasswordRecovery,
    isRecoveryLoading,
    requestPasswordReset,
    setRecoveryPassword,
    cancelPasswordRecovery,
    isSignedIn: Boolean(session),
    notifyRecordedActivitySaved,
    profile,
    recordedActivityVersion,
    registrationVersion,
    signIn,
    resendConfirmation,
    signOut,
    deleteAccount,
    signUp,
    toggleActivity,
    user: session?.user ?? null,
  }), [isPasswordRecovery, isRecoveryLoading, requestPasswordReset, setRecoveryPassword, cancelPasswordRecovery, notifyRecordedActivitySaved, isLoading, joinedActivityIds, profile, recordedActivityVersion, registrationVersion, session, signIn, resendConfirmation, signOut, signUp, toggleActivity, deleteAccount]);

  return <DemoSessionContext.Provider value={value}>{children}</DemoSessionContext.Provider>;
}

export function useDemoSession() {
  const context = useContext(DemoSessionContext);

  if (!context) {
    throw new Error('useDemoSession debe utilizarse dentro de DemoSessionProvider.');
  }

  return context;
}
