import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { DemoSessionProvider } from '@/contexts/demo-session';
import { getTrackingSnapshot } from '@/lib/tracking-store';
import { startActiveLocationService } from '@/tasks/background-location';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    const activeSession = getTrackingSnapshot();

    if (activeSession?.status === 'active') {
      void startActiveLocationService().catch(() => {
        // El tracker mostrará cualquier problema de permisos al abrirlo.
      });
    }
  }, []);

  return (
    <DemoSessionProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="track" options={{ animation: 'slide_from_bottom' }} />
        </Stack>
      </ThemeProvider>
    </DemoSessionProvider>
  );
}
