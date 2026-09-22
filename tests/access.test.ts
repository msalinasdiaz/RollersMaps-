import { createRequire } from 'node:module';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RootLayout from '@/app/_layout';

const session = vi.hoisted(() => ({ isLoading: false, isSignedIn: false, user: null as null | { id: string } }));
vi.mock('@/contexts/demo-session', () => ({
  useDemoSession: () => session,
  DemoSessionProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/contexts/community', () => ({ CommunityProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/animated-icon', () => ({ AnimatedSplashOverlay: () => null }));
vi.mock('@/lib/tracking-store', () => ({ getTrackingSnapshot: vi.fn() }));
vi.mock('@/tasks/background-location', () => ({ startActiveLocationService: vi.fn() }));
vi.mock('expo-splash-screen', () => ({ preventAutoHideAsync: vi.fn() }));
vi.mock('react-native', () => ({
  useColorScheme: () => 'dark',
  StyleSheet: { create: (value: unknown) => value },
  ActivityIndicator: () => null,
  View: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  Text: ({ children }: { children: ReactNode }) => createElement('span', null, children),
}));
vi.mock('expo-router', () => ({
  DarkTheme: {}, DefaultTheme: {},
  ThemeProvider: ({ children }: { children: ReactNode }) => children,
  Stack: Object.assign(({ children }: { children: ReactNode }) => children, {
    Protected: ({ guard, children }: { guard: boolean; children: ReactNode }) => guard ? children : null,
    Screen: ({ name }: { name: string }) => createElement('div', { 'data-screen': name }),
  }),
}));

// Render the real layout with navigation/native adapters. Deep-link behavior is
// additionally checked in the Android app; these tests guard the access declaration.
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (element: ReactElement) => string;
};
function availableScreens() {
  return [...renderToStaticMarkup(createElement(RootLayout)).matchAll(/data-screen="([^"]+)"/g)].map(match => match[1]);
}
beforeEach(() => Object.assign(session, { isLoading: false, isSignedIn: false, user: null }));

describe('Acceso con cuenta, independiente de grupos', () => {
  it('espera la restauración de sesión antes de mostrar pantallas', () => {
    session.isLoading = true;
    expect(availableScreens()).toEqual([]);
  });
  it('sin cuenta solo ofrece bienvenida, autenticación y recuperación de enlaces', () => {
    expect(availableScreens()).toEqual(['welcome', 'auth', '+not-found']);
  });
  it('una cuenta sin membresías accede a funciones personales y a descubrir grupos', () => {
    Object.assign(session, { isSignedIn: true, user: { id: 'account-a' } });
    expect(availableScreens()).toEqual(['(tabs)', 'track', 'group', 'create-group', 'activity-editor', '+not-found']);
  });
  it('al cerrar sesión retira todas las pantallas privadas', () => {
    Object.assign(session, { isSignedIn: true, user: { id: 'account-a' } });
    expect(availableScreens()).toContain('track');
    Object.assign(session, { isSignedIn: false, user: null });
    expect(availableScreens()).toEqual(['welcome', 'auth', '+not-found']);
  });
});
