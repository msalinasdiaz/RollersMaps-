import { DarkTheme, router, Stack, ThemeProvider, usePathname, useRootNavigationState } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { CommunityProvider } from '@/contexts/community';
import { DemoSessionProvider, useDemoSession } from '@/contexts/demo-session';
import { getTrackingSnapshot, initializeTrackingDatabaseBackground, reportTrackingError } from '@/lib/tracking-store';
import { isLocationServiceCancellation, startActiveLocationService } from '@/tasks/background-location';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return <DemoSessionProvider>
    <CommunityProvider>
      <ThemeProvider value={DarkTheme}>
        <AnimatedSplashOverlay />
        <AppNavigator />
      </ThemeProvider>
    </CommunityProvider>
  </DemoSessionProvider>;
}

function AppNavigator() {
  const { isLoading, isSignedIn, isPasswordRecovery, isRecoveryLoading, user } = useDemoSession();
  const userId = user?.id;
  const pathname = usePathname();
  const navigation = useRootNavigationState();
  useEffect(() => {
    if (navigation?.key && !isLoading && !isRecoveryLoading && isSignedIn && isPasswordRecovery && pathname !== '/reset-password') {
      router.replace('/reset-password');
    }
  }, [navigation?.key, pathname, isLoading, isRecoveryLoading, isSignedIn, isPasswordRecovery]);
  useEffect(() => {
    if (isLoading || isRecoveryLoading || isPasswordRecovery || !userId) return;
    let cancelled = false;
    void (async () => {
      try { await initializeTrackingDatabaseBackground(); }
      catch { return; } // The store retains its actionable persistence error.
      if (cancelled) return;
      const activeSession = getTrackingSnapshot(userId);
      if (activeSession?.status === 'active' && activeSession.userId === userId) {
        try { await startActiveLocationService(userId); }
        catch (error) { if (!isLocationServiceCancellation(error)) await reportTrackingError('No pudimos reactivar el GPS. Abre tu recorrido para revisar los permisos.'); }
      }
    })().catch(() => { /* The store exposes persistence errors on the tracking screen. */ });
    return () => { cancelled = true; };
  }, [isLoading, isRecoveryLoading, isPasswordRecovery, userId]);

  if (isLoading || isRecoveryLoading) return <View style={styles.loading}>
    <ActivityIndicator color="#FF9A45" />
    <Text style={styles.loadingText}>{isRecoveryLoading ? 'Verificando tu enlace…' : 'Preparando tu cuenta…'}</Text>
  </View>;

  return <Stack screenOptions={{ headerShown: false }}>
    <Stack.Protected guard={!isSignedIn && !isPasswordRecovery}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="auth" />
    </Stack.Protected>
    <Stack.Protected guard={isSignedIn && !isPasswordRecovery}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="track" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="group" />
      <Stack.Screen name="create-group" />
      <Stack.Screen name="group-requests" />
      <Stack.Screen name="activity-editor" />
      <Stack.Screen name="mapped-routes" />
      <Stack.Screen name="account" />
      <Stack.Screen name="report-content" />
      <Stack.Screen name="moderation" />
    </Stack.Protected>
    <Stack.Protected guard={isSignedIn && isPasswordRecovery}>
      <Stack.Screen name="reset-password" />
    </Stack.Protected>
    <Stack.Screen name="legal" />
    <Stack.Screen name="+not-found" />
  </Stack>;
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: '#070707', alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingText: { color: '#C8C8C8', fontSize: 15 },
});
