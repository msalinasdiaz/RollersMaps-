import '@/global.css';
import { Platform } from 'react-native';

const brandColors = { text: '#F7F7F7', background: '#070707', backgroundElement: '#151515', backgroundSelected: '#242424', textSecondary: '#A8A8A8' };
export const Colors = { light: brandColors, dark: brandColors } as const;
export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({ ios: { sans: 'system-ui', serif: 'ui-serif', rounded: 'ui-rounded', mono: 'ui-monospace' }, default: { sans: 'normal', serif: 'serif', rounded: 'normal', mono: 'monospace' }, web: { sans: 'var(--font-display)', serif: 'var(--font-serif)', rounded: 'var(--font-rounded)', mono: 'var(--font-mono)' } });
export const Spacing = { half: 2, one: 4, two: 8, three: 16, four: 24, five: 32, six: 64 } as const;
export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;