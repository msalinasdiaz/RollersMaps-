import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDemoSession } from '@/contexts/demo-session';
const officialLogo = require('@/assets/images/rollersmaps-app-icon.png');
export default function AuthScreen() {
  const { signIn, signUp } = useDemoSession();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const [isCreatingAccount, setIsCreatingAccount] = useState(mode === 'signup');
  const submitting = useRef(false);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (submitting.current) return;
    setNotice(null);
    const cleanEmail = email.trim();

    if (!cleanEmail || !password || (isCreatingAccount && !displayName.trim())) {
      setNotice(isCreatingAccount ? 'Completa tu nombre, correo y contraseña para crear la cuenta.' : 'Ingresa tu correo y contraseña.');
      return;
    }

    if (isCreatingAccount && password.length < 8) {
      setNotice('Usa una contraseña de al menos 8 caracteres.');
      return;
    }

    submitting.current = true;
    setIsSubmitting(true);
    try {
    if (isCreatingAccount) {
      const result = await signUp(displayName, cleanEmail, password);
      if (!result.error && result.confirmationSent) { setIsCreatingAccount(false); setPassword(''); }
      setNotice(result.error ?? (result.confirmationSent
        ? 'Te enviamos un correo para confirmar tu cuenta. Ábrelo desde este teléfono y luego ingresa.'
        : 'Tu cuenta quedó creada. Ya puedes empezar a patinar.'));
    } else {
      const error = await signIn(cleanEmail, password);
      setNotice(error);
    }
    } catch {
      setNotice('No pudimos conectar. Revisa tu conexión e inténtalo nuevamente.');
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  };

  const changeMode = () => {
    setIsCreatingAccount((current) => !current);
    setNotice(null);
    setPassword('');
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.safeArea}>
          <ScrollView
            automaticallyAdjustKeyboardInsets
            contentContainerStyle={styles.loginContent}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <View style={styles.loginLogoFrame}>
              <Image source={officialLogo} resizeMode="contain" style={styles.loginLogo} />
            </View>
            <Text style={styles.loginTitle}>{isCreatingAccount ? 'Súmate a RollersMaps' : 'Bienvenido a RollersMaps'}</Text>
            <Text style={styles.loginSubtitle}>{isCreatingAccount ? 'Guarda tus rutas y kilómetros. Tú eliges si quieres unirte a un grupo.' : 'Ingresa para ver tus rutas, registrar recorridos y participar en tus grupos.'}</Text>

            <View style={styles.authCard}>
              {isCreatingAccount ? (
                <Field label="Tu nombre" value={displayName} onChangeText={setDisplayName} placeholder="Ej.: Fran Pérez" autoCapitalize="words" autoComplete="name" textContentType="name" returnKeyType="next" />
              ) : null}
              <Field label="Correo" value={email} onChangeText={setEmail} placeholder="tu.correo@ejemplo.cl" keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" returnKeyType="next" />
              <Field
                label="Contraseña"
                value={password}
                onChangeText={setPassword}
                placeholder={isCreatingAccount ? 'Mínimo 8 caracteres' : 'Tu contraseña'}
                secureTextEntry
                autoCapitalize="none"
                autoComplete={isCreatingAccount ? 'new-password' : 'current-password'}
                textContentType={isCreatingAccount ? 'newPassword' : 'password'}
                returnKeyType="done"
                onSubmitEditing={() => { void handleSubmit(); }}
              />
              {notice ? <Text accessibilityLiveRegion="polite" style={styles.authNotice}>{notice}</Text> : null}
              <Pressable accessibilityRole="button" disabled={isSubmitting} onPress={() => { void handleSubmit(); }} style={[styles.loginButton, isSubmitting && styles.loginButtonDisabled]}>
                {isSubmitting ? <ActivityIndicator color="#151515" /> : <Text style={styles.loginButtonText}>{isCreatingAccount ? 'Crear cuenta' : 'Iniciar sesión'}</Text>}
              </Pressable>
              <Pressable accessibilityRole="button" disabled={isSubmitting} onPress={changeMode} style={styles.modeButton}>
                <Text style={styles.modeButtonText}>{isCreatingAccount ? 'Ya tengo cuenta · Iniciar sesión' : '¿Primera vez? Crear cuenta'}</Text>
              </Pressable>
            </View>

            <View style={styles.safetyNote}>
              <Text style={styles.safetyNoteTitle}>Casco obligatorio</Text>
              <Text style={styles.safetyNoteText}>Todas las actividades requieren casco. La app te recordará esta regla al confirmar cada inscripción.</Text>
            </View>
            <Pressable accessibilityRole="button" disabled={isSubmitting} onPress={() => router.replace('/welcome')} style={styles.modeButton}><Text style={styles.modeButtonText}>Volver a la bienvenida</Text></Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function Field({ label, ...props }: { label: string } & ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput {...props} accessibilityLabel={label} placeholderTextColor="#777777" style={styles.fieldInput} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#070707' },
  safeArea: { flex: 1 },
  loadingScreen: { alignItems: 'center', gap: 13, justifyContent: 'center' },
  loadingText: { color: '#C8C8C8', fontSize: 13, fontWeight: '700' },
  loginContent: { alignItems: 'stretch', flexGrow: 1, gap: 15, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 32 },
  loginLogoFrame: { alignItems: 'center', alignSelf: 'center', backgroundColor: '#F8FAFC', borderRadius: 52, height: 104, justifyContent: 'center', overflow: 'hidden', width: 104 },
  loginLogo: { height: 104, width: 104 },
  loginTitle: { color: '#FFFFFF', fontSize: 26, fontWeight: '900', lineHeight: 31, textAlign: 'center' },
  loginSubtitle: { color: '#B8B8B8', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  authCard: { backgroundColor: '#151515', borderColor: '#343434', borderRadius: 18, borderWidth: 1, gap: 14, padding: 16 },
  field: { gap: 6 },
  fieldLabel: { color: '#D8D8D8', fontSize: 11, fontWeight: '800' },
  fieldInput: { backgroundColor: '#0E0E0E', borderColor: '#373737', borderRadius: 11, borderWidth: 1, color: '#FFFFFF', fontSize: 14, minHeight: 47, paddingHorizontal: 13 },
  authNotice: { color: '#FFBC78', fontSize: 11, fontWeight: '700', lineHeight: 16 },
  loginButton: { alignItems: 'center', backgroundColor: '#FF7900', borderRadius: 12, marginTop: 2, minHeight: 48, justifyContent: 'center', paddingVertical: 13 },
  loginButtonDisabled: { opacity: 0.65 },
  loginButtonText: { color: '#151515', fontSize: 14, fontWeight: '900' },
  modeButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingVertical: 8 },
  modeButtonText: { color: '#FF9A45', fontSize: 12, fontWeight: '800' },
  safetyNote: { backgroundColor: '#21180F', borderLeftColor: '#FF7900', borderLeftWidth: 4, borderRadius: 12, padding: 14 },
  safetyNoteTitle: { color: '#FFB35F', fontSize: 12, fontWeight: '900' },
  safetyNoteText: { color: '#D5C3B2', fontSize: 11, lineHeight: 16, marginTop: 4 },
});
