import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { DemoSessionProvider } from '@/contexts/demo-session';
import { getTrackingSnapshot } from '@/lib/tracking-store';
import { startActiveLocationService } from '@/tasks/background-location';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    const activeSession = getTrackingSnapshot();
    if (activeSession?.status === 'active') {
      void startActiveLocationService().catch(() => {
        // The tracker screen explains any missing permission when the user opens it.
      });
    }
  }, []);

  return (
    <DemoSessionProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="track" options={{ animation: 'slide_from_bottom' }} />
        </Stack>
      </ThemeProvider>
    </DemoSessionProvider>
  );
}
