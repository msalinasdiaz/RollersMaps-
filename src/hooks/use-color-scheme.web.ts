import { useColorScheme as useRNColorScheme } from 'react-native';

/**
 * Entrega un tema seguro durante el renderizado estático y respeta el tema del sistema al abrir la app.
 */
export function useColorScheme() {
  return useRNColorScheme() ?? 'light';
}
