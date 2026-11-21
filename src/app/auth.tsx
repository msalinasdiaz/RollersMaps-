import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState, type ComponentPropsWithRef } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDemoSession } from '@/contexts/demo-session';
import { validAuthEmail } from '@/lib/auth-actions';
const officialLogo = require('@/assets/images/rollersmaps-app-icon.png');
export default function AuthScreen() {
  const { signIn, signUp, resendConfirmation, requestPasswordReset } = useDemoSession();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const [isCreatingAccount, setIsCreatingAccount] = useState(mode === 'signup');
  const [isRequestingRecovery, setIsRequestingRecovery] = useState(false);
  const submitting = useRef(false);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const emailInput = useRef<TextInput>(null);
  const passwordInput = useRef<TextInput>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [resendAvailableAt, setResendAvailableAt] = useState(0);
  const [recoveryAvailableAt, setRecoveryAvailableAt] = useState(0);
  const [now, setNow] = useState(0);
  const resendSeconds = Math.max(0, Math.ceil((resendAvailableAt - now) / 1000));

  const recoverySeconds = Math.max(0, Math.ceil((recoveryAvailableAt - now) / 1000));

  useEffect(() => {
    const availableAt = Math.max(resendAvailableAt, recoveryAvailableAt);
    if (!availableAt) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= availableAt) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendAvailableAt, recoveryAvailableAt]);

  const handleSubmit = async () => {
    if (submitting.current || (isRequestingRecovery && Date.now() < recoveryAvailableAt)) return;
    setNotice(null);
    const cleanEmail = email.trim();

    if (!cleanEmail || (!isRequestingRecovery && !password) || (isCreatingAccount && !displayName.trim())) {
      setNotice(isRequestingRecovery ? 'Ingresa el correo de tu cuenta.' : isCreatingAccount ? 'Completa tu nombre, correo y contraseña para crear la cuenta.' : 'Ingresa tu correo y contraseña.');
      return;
    }

    if (!validAuthEmail(cleanEmail)) {
      setNotice('Ingresa una dirección de correo válida.');
      return;
    }

    if (isCreatingAccount && (Array.from(displayName.trim()).length < 2 || Array.from(displayName.trim()).length > 60)) {
      setNotice('Usa un nombre de entre 2 y 60 caracteres.');
      return;
    }

    if (isCreatingAccount && password.length < 8) {
      setNotice('Usa una contraseña de al menos 8 caracteres.');
      return;
    }

    if (isCreatingAccount && !acceptedTerms) { setNotice('Lee y acepta las normas de la comunidad y la política de privacidad.'); return; }
    submitting.current = true;
    setIsSubmitting(true);
    try {
    if (isRequestingRecovery) {
      const error = await requestPasswordReset(cleanEmail);
      if (!error) {
        const current = Date.now();
        setNow(current);
        setRecoveryAvailableAt(current + 60000);
      }
      setNotice(error ?? 'Si tienes una cuenta con ese correo, recibirás un enlace para cambiar tu contraseña. Revisa también spam y abre el correo más reciente desde este teléfono.');
    } else if (isCreatingAccount) {
      const result = await signUp(displayName, cleanEmail, password, acceptedTerms);
      if (!result.error && result.confirmationSent) {
        setIsCreatingAccount(false);
        setPassword('');
        const current = Date.now();
        setNow(current);
        setResendAvailableAt(current + 60000);
      }
      setNotice(result.error ?? (result.confirmationSent
        ? 'Revisa tu correo y spam para confirmar la cuenta. Abre el enlace desde este teléfono. Si ya tenías una cuenta, inicia sesión.'
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

  const handleResend = async () => {
    if (submitting.current || Date.now() < resendAvailableAt) return;
    if (!validAuthEmail(email)) { setNotice('Ingresa tu correo para reenviar la confirmación.'); return; }
    submitting.current = true;
    setIsSubmitting(true);
    setNotice(null);
    try {
      const error = await resendConfirmation(email);
      if (!error) {
        const current = Date.now();
        setNow(current);
        setResendAvailableAt(current + 60000);
      }
      setNotice(error ?? 'Si este correo tiene una cuenta pendiente, recibirás un nuevo enlace. Revisa también spam y abre el correo más reciente desde este teléfono.');
    } catch {
      setNotice('No pudimos conectar. Revisa tu conexión e inténtalo nuevamente.');
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  };

  const changeMode = () => {
    if (isRequestingRecovery) { setIsRequestingRecovery(false); setIsCreatingAccount(false); }
    else setIsCreatingAccount((current) => !current);
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
            <Text style={styles.loginTitle}>{isRequestingRecovery ? 'Recupera tu cuenta' : isCreatingAccount ? 'Súmate a RollersMaps' : 'Bienvenido a RollersMaps'}</Text>
            <Text style={styles.loginSubtitle}>{isRequestingRecovery ? 'Escribe el correo de tu cuenta para recibir un enlace de recuperación.' : isCreatingAccount ? 'Guarda tus rutas y kilómetros. Tú eliges si quieres unirte a un grupo.' : 'Ingresa para ver tus rutas, registrar recorridos y participar en tus grupos.'}</Text>

            <View style={styles.authCard}>
              {isCreatingAccount ? (
                <Field editable={!isSubmitting} onSubmitEditing={() => emailInput.current?.focus()} submitBehavior="submit" label="Tu nombre" value={displayName} onChangeText={setDisplayName} placeholder="Ej.: Fran Pérez" autoCapitalize="words" autoComplete="name" textContentType="name" returnKeyType="next" />
              ) : null}
              <Field ref={emailInput} editable={!isSubmitting} submitBehavior={isRequestingRecovery ? 'blurAndSubmit' : 'submit'} label="Correo" value={email} onChangeText={setEmail} placeholder="tu.correo@ejemplo.cl" keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" autoCorrect={false} returnKeyType={isRequestingRecovery ? 'done' : 'next'} onSubmitEditing={isRequestingRecovery ? () => { void handleSubmit(); } : () => passwordInput.current?.focus()} />
              {!isRequestingRecovery ? <Field
                label="Contraseña"
                value={password}
                onChangeText={setPassword}
                placeholder={isCreatingAccount ? 'Mínimo 8 caracteres' : 'Tu contraseña'}
                ref={passwordInput}
                editable={!isSubmitting}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete={isCreatingAccount ? 'new-password' : 'current-password'}
                textContentType={isCreatingAccount ? 'newPassword' : 'password'}
                returnKeyType="done"
                onSubmitEditing={() => { void handleSubmit(); }}
              /> : null}
              {!isRequestingRecovery ? <Pressable accessibilityRole="button" disabled={isSubmitting} onPress={() => setShowPassword(value => !value)} style={styles.modeButton}><Text style={styles.modeButtonText}>{showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}</Text></Pressable> : null}
              {isCreatingAccount ? <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: acceptedTerms, disabled: isSubmitting }} disabled={isSubmitting} onPress={() => setAcceptedTerms(value => !value)} style={styles.modeButton}><Text style={styles.modeButtonText}>{acceptedTerms ? '☑' : '☐'} Acepto las normas de la comunidad y la política de privacidad</Text></Pressable> : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16 }}>
                <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/legal', params: { section: 'terms' } })} style={styles.modeButton}><Text style={styles.modeButtonText}>Leer normas</Text></Pressable>
                <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/legal', params: { section: 'privacy' } })} style={styles.modeButton}><Text style={styles.modeButtonText}>Privacidad</Text></Pressable>
              </View>
              {notice ? <Text accessibilityLiveRegion="polite" style={styles.authNotice}>{notice}</Text> : null}
              <Pressable accessibilityRole="button" disabled={isSubmitting || (isRequestingRecovery && recoverySeconds > 0)} onPress={() => { void handleSubmit(); }} style={[styles.loginButton, (isSubmitting || (isRequestingRecovery && recoverySeconds > 0)) && styles.loginButtonDisabled]}>
                {isSubmitting ? <ActivityIndicator color="#151515" /> : <Text style={styles.loginButtonText}>{isRequestingRecovery ? (recoverySeconds > 0 ? `Enviar de nuevo en ${recoverySeconds} s` : 'Enviar enlace de recuperación') : isCreatingAccount ? 'Crear cuenta' : 'Iniciar sesión'}</Text>}
              </Pressable>
              {!isCreatingAccount && !isRequestingRecovery ? (
                <Pressable accessibilityRole="button" disabled={isSubmitting || resendSeconds > 0} onPress={() => { void handleResend(); }} style={[styles.modeButton, (isSubmitting || resendSeconds > 0) && styles.loginButtonDisabled]}>
                  <Text style={styles.modeButtonText}>{resendSeconds > 0 ? `Reenviar confirmación en ${resendSeconds} s` : 'Reenviar correo de confirmación'}</Text>
                </Pressable>
              ) : null}
              {!isCreatingAccount && !isRequestingRecovery ? <Pressable accessibilityRole="button" disabled={isSubmitting} onPress={() => { setIsRequestingRecovery(true); setNotice(null); setPassword(''); }} style={styles.modeButton}><Text style={styles.modeButtonText}>Olvidé mi contraseña</Text></Pressable> : null}
              <Pressable accessibilityRole="button" disabled={isSubmitting} onPress={changeMode} style={styles.modeButton}>
                <Text style={styles.modeButtonText}>{isRequestingRecovery ? 'Volver a iniciar sesión' : isCreatingAccount ? 'Ya tengo cuenta · Iniciar sesión' : '¿Primera vez? Crear cuenta'}</Text>
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

function Field({ label, ...props }: { label: string } & ComponentPropsWithRef<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput {...props} accessibilityLabel={label} placeholderTextColor="#A0A0A0" style={styles.fieldInput} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#070707' },
  safeArea: { flex: 1 },
  loadingScreen: { alignItems: 'center', gap: 13, justifyContent: 'center' },
  loadingText: { color: '#C8C8C8', fontSize: 14, fontWeight: '700' },
  loginContent: { alignItems: 'stretch', flexGrow: 1, gap: 15, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 32 },
  loginLogoFrame: { alignItems: 'center', alignSelf: 'center', backgroundColor: '#F8FAFC', borderRadius: 52, height: 104, justifyContent: 'center', overflow: 'hidden', width: 104 },
  loginLogo: { height: 104, width: 104 },
  loginTitle: { color: '#FFFFFF', fontSize: 26, fontWeight: '900', lineHeight: 31, textAlign: 'center' },
  loginSubtitle: { color: '#B8B8B8', fontSize: 14, lineHeight: 21, textAlign: 'center' },
  authCard: { backgroundColor: '#151515', borderColor: '#343434', borderRadius: 18, borderWidth: 1, gap: 14, padding: 16 },
  field: { gap: 6 },
  fieldLabel: { color: '#D8D8D8', fontSize: 14, fontWeight: '800' },
  fieldInput: { backgroundColor: '#0E0E0E', borderColor: '#373737', borderRadius: 11, borderWidth: 1, color: '#FFFFFF', fontSize: 14, minHeight: 48, paddingHorizontal: 13 },
  authNotice: { color: '#FFBC78', fontSize: 14, fontWeight: '700', lineHeight: 21 },
  loginButton: { alignItems: 'center', backgroundColor: '#FF7900', borderRadius: 12, marginTop: 2, minHeight: 48, justifyContent: 'center', paddingVertical: 13 },
  loginButtonDisabled: { opacity: 0.65 },
  loginButtonText: { color: '#151515', fontSize: 14, fontWeight: '900' },
  modeButton: { alignItems: 'center', justifyContent: 'center', minHeight: 48, paddingVertical: 8 },
  modeButtonText: { color: '#FF9A45', fontSize: 14, fontWeight: '800' },
  safetyNote: { backgroundColor: '#21180F', borderLeftColor: '#FF7900', borderLeftWidth: 4, borderRadius: 12, padding: 14 },
  safetyNoteTitle: { color: '#FFB35F', fontSize: 14, fontWeight: '900' },
  safetyNoteText: { color: '#D5C3B2', fontSize: 14, lineHeight: 21, marginTop: 4 },
});
