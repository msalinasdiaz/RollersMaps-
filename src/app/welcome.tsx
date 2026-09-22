import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const logo = require('@/assets/images/rollersmaps-app-icon.png');

export default function WelcomeScreen() {
  return <SafeAreaView style={styles.screen}>
    <StatusBar style="light" />
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.brand}>
        <Image source={logo} style={styles.logo} accessibilityLabel="RollersMaps" />
        <Text style={styles.brandName}>ROLLERSMAPS</Text>
      </View>
      <View style={styles.introduction}>
        <Text accessibilityRole="header" style={styles.title}>Tus rutas, tus kilómetros y tu comunidad</Text>
        <Text style={styles.description}>Crea tu cuenta en RollersMaps para guardar tus recorridos, consultar las distancias y revisar tu historial.</Text>
        <Text style={styles.description}>Descubre grupos de patinaje y únete para acceder a sus calendarios y participar en sus actividades.</Text>
      </View>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" style={styles.primary} onPress={() => router.push({ pathname: '/auth', params: { mode: 'signup' } })}>
          <Text style={styles.primaryText}>Crear cuenta</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => router.push('/auth')}>
          <Text style={styles.secondaryText}>¿Ya tienes cuenta? <Text style={styles.link}>Iniciar sesión</Text></Text>
        </Pressable>
        <Text style={styles.note}>Tu cuenta es personal. Tú eliges si quieres unirte a un grupo.</Text>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#070707' },
  content: { flexGrow: 1, justifyContent: 'center', padding: 28, gap: 32, width: '100%', maxWidth: 520, alignSelf: 'center' },
  brand: { alignItems: 'center', gap: 14 },
  logo: { width: 96, height: 96, borderRadius: 28 },
  brandName: { color: '#FF9A45', fontSize: 13, fontWeight: '800', letterSpacing: 2.2 },
  introduction: { gap: 18 },
  title: { color: '#FFFFFF', fontSize: 34, lineHeight: 40, fontWeight: '900' },
  description: { color: '#BEBEBE', fontSize: 16, lineHeight: 24 },
  actions: { gap: 12 },
  primary: { backgroundColor: '#FF7900', borderRadius: 14, padding: 16, minHeight: 54, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#141414', fontSize: 17, fontWeight: '800' },
  secondary: { minHeight: 48, justifyContent: 'center', alignItems: 'center', paddingVertical: 10 },
  secondaryText: { color: '#BEBEBE', fontSize: 14, textAlign: 'center' },
  link: { color: '#FFAD65', fontWeight: '800' },
  note: { color: '#969696', fontSize: 13, lineHeight: 19, textAlign: 'center' },
});
