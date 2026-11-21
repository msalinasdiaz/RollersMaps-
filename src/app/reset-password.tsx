import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState, type ComponentPropsWithRef } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDemoSession } from '@/contexts/demo-session';
import { authErrorMessage } from '@/lib/auth-errors';

export default function ResetPasswordScreen() {
  const { isSignedIn, isPasswordRecovery, setRecoveryPassword, cancelPasswordRecovery } = useDemoSession();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const confirmationInput = useRef<TextInput>(null);
  const [confirmation, setConfirmation] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  async function save() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setNotice(null);
    try {
      const error = await setRecoveryPassword(password, confirmation);
      if (error) { setNotice(error); return; }
      setPassword('');
      setConfirmation('');
      Alert.alert('Contraseña actualizada', 'Tu cuenta quedó recuperada. La próxima vez podrás ingresar con tu contraseña nueva.');
    } catch (error) { setNotice(authErrorMessage(error)); }
    finally { submitting.current = false; setBusy(false); }
  }

  async function cancel() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      const error = await cancelPasswordRecovery();
      if (error) { setNotice(error); return; }
      router.replace('/auth');
    } catch (error) { setNotice(authErrorMessage(error)); }
    finally { submitting.current = false; setBusy(false); }
  }

  return <View style={styles.screen}>
    <StatusBar style="light" />
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
          <Text style={styles.brand}>RollersMaps</Text>
          <Text style={styles.title}>Elige tu contraseña nueva</Text>
          <Text style={styles.subtitle}>Usa al menos 8 caracteres y escríbela dos veces para confirmar.</Text>
          <View style={styles.card}>
            <Field submitBehavior="submit" onSubmitEditing={() => confirmationInput.current?.focus()} label="Nueva contraseña" value={password} onChangeText={setPassword} placeholder="Mínimo 8 caracteres" secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword" returnKeyType="next" editable={!busy} />
            <Field ref={confirmationInput} label="Confirmar contraseña" value={confirmation} onChangeText={setConfirmation} placeholder="Repite tu contraseña nueva" secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword" returnKeyType="done" editable={!busy} onSubmitEditing={() => { void save(); }} />
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => setShowPassword(value => !value)} style={styles.link}><Text style={styles.linkText}>{showPassword ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}</Text></Pressable>
            {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
            <Pressable accessibilityRole="button" disabled={busy || !isSignedIn || !isPasswordRecovery} onPress={() => { void save(); }} style={[styles.button, (busy || !isSignedIn || !isPasswordRecovery) && styles.disabled]}>
              {busy ? <ActivityIndicator color="#151515" /> : <Text style={styles.buttonText}>Guardar contraseña nueva</Text>}
            </Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void cancel(); }} style={styles.link}><Text style={styles.linkText}>Volver a iniciar sesión</Text></Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </View>;
}

function Field({ label, ...props }: { label: string } & ComponentPropsWithRef<typeof TextInput>) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...props} accessibilityLabel={label} placeholderTextColor="#A0A0A0" style={styles.input} /></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#070707' }, safeArea: { flex: 1 },
  content: { flexGrow: 1, gap: 16, padding: 24, paddingTop: 40, paddingBottom: 32 },
  brand: { color: '#FF9A45', fontSize: 16, fontWeight: '900' },
  title: { color: '#FFFFFF', fontSize: 26, fontWeight: '900', lineHeight: 32 },
  subtitle: { color: '#B8B8B8', fontSize: 14, lineHeight: 21 },
  card: { backgroundColor: '#151515', borderColor: '#343434', borderWidth: 1, borderRadius: 18, padding: 16, gap: 16 },
  field: { gap: 7 }, label: { color: '#D8D8D8', fontSize: 14, fontWeight: '800' },
  input: { backgroundColor: '#0E0E0E', borderColor: '#373737', borderWidth: 1, borderRadius: 11, color: '#FFFFFF', fontSize: 14, minHeight: 48, paddingHorizontal: 13 },
  notice: { color: '#FFBC78', fontSize: 14, lineHeight: 21 },
  button: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#FF7900', borderRadius: 12, minHeight: 48, paddingVertical: 13 },
  buttonText: { color: '#151515', fontSize: 14, fontWeight: '900' }, disabled: { opacity: 0.65 },
  link: { alignItems: 'center', justifyContent: 'center', minHeight: 48 }, linkText: { color: '#FF9A45', fontSize: 14, fontWeight: '800' },
});
