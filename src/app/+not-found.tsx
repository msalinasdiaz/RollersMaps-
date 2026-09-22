import { router, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useDemoSession } from '@/contexts/demo-session';

const brandLogo = require('@/assets/images/rollersmaps-app-icon.png');

export default function NotFoundScreen() {
  const pathname = usePathname();
  const { isLoading, isSignedIn } = useDemoSession();
  const isAuthCallback = pathname.includes('auth/callback') || pathname.includes('login-callback');

  useEffect(() => {
    if (isLoading || !isSignedIn) {
      return undefined;
    }

    const timeoutId = setTimeout(() => router.replace('/'), 700);
    return () => clearTimeout(timeoutId);
  }, [isLoading, isSignedIn]);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <View style={styles.logoFrame}>
            <Image source={brandLogo} resizeMode="contain" style={styles.logo} />
          </View>
          <Text style={styles.eyebrow}>ROLLERSMAPS</Text>
          <Text style={styles.title}>{isAuthCallback ? 'Estamos confirmando tu cuenta' : 'Esta pantalla no está disponible'}</Text>
          <Text style={styles.text}>
            {isAuthCallback
              ? (isSignedIn ? '¡Listo! Tu correo quedó confirmado. Te llevamos a Inicio.' : 'Espera un poquito mientras validamos el enlace. Si ya confirmaste tu correo, vuelve a Inicio e ingresa con tus datos.')
              : 'El enlace que abriste no existe o ya no está disponible. Volvamos a la app para seguir patinando.'}
          </Text>
          {isLoading ? <Text style={styles.status}>Validando enlace…</Text> : null}
          <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={styles.button}>
            <Text style={styles.buttonText}>{isSignedIn ? 'Volver a Inicio' : 'Ir a la bienvenida'}</Text>
          </Pressable>
          <Text style={styles.footer}>RollersMaps · Tu comunidad de patinaje</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#070707', flex: 1 },
  safeArea: { flex: 1 },
  content: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 28 },
  logoFrame: { alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 58, height: 116, justifyContent: 'center', overflow: 'hidden', width: 116 },
  logo: { height: 116, width: 116 },
  eyebrow: { color: '#FF7900', fontSize: 11, fontWeight: '900', letterSpacing: 2, marginTop: 24 },
  title: { color: '#FFFFFF', fontSize: 26, fontWeight: '900', lineHeight: 32, marginTop: 8, textAlign: 'center' },
  text: { color: '#B8B8B8', fontSize: 14, lineHeight: 21, marginTop: 12, maxWidth: 360, textAlign: 'center' },
  status: { color: '#FFB35F', fontSize: 12, fontWeight: '800', marginTop: 18 },
  button: { alignItems: 'center', backgroundColor: '#FF7900', borderRadius: 13, marginTop: 24, minWidth: 210, paddingHorizontal: 22, paddingVertical: 14 },
  buttonText: { color: '#151515', fontSize: 14, fontWeight: '900' },
  footer: { color: '#777777', fontSize: 10, marginTop: 20, textAlign: 'center' },
});
