import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { CommunityProvider } from '@/contexts/community';
import { DemoSessionProvider, useDemoSession } from '@/contexts/demo-session';
import { getTrackingSnapshot } from '@/lib/tracking-store';
import { startActiveLocationService } from '@/tasks/background-location';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return <DemoSessionProvider>
    <CommunityProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <AppNavigator />
      </ThemeProvider>
    </CommunityProvider>
  </DemoSessionProvider>;
}

function AppNavigator() {
  const { isLoading, isSignedIn, user } = useDemoSession();
  const userId = user?.id;
  useEffect(() => {
    if (isLoading || !userId) return;
    const activeSession = getTrackingSnapshot(userId);
    if (activeSession?.status === 'active' && activeSession.userId === userId) {
      void startActiveLocationService().catch(() => {
        // The tracker explains any missing permission when opened.
      });
    }
  }, [isLoading, userId]);

  if (isLoading) return <View style={styles.loading}>
    <ActivityIndicator color="#FF9A45" />
    <Text style={styles.loadingText}>Preparando tu cuenta…</Text>
  </View>;

  return <Stack screenOptions={{ headerShown: false }}>
    <Stack.Protected guard={!isSignedIn}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="auth" />
    </Stack.Protected>
    <Stack.Protected guard={isSignedIn}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="track" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="group" />
      <Stack.Screen name="create-group" />
      <Stack.Screen name="activity-editor" />
    </Stack.Protected>
    <Stack.Screen name="+not-found" />
  </Stack>;
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: '#070707', alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingText: { color: '#C8C8C8', fontSize: 15 },
});
