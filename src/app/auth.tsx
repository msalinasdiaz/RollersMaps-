import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDemoSession } from '@/contexts/demo-session';
const officialLogo = require('@/assets/images/rollersmaps-app-icon.png');
export default function AuthScreen() {
  const { signIn, signUp, isSignedIn } = useDemoSession();
  useEffect(() => { if (isSignedIn) router.replace('/'); }, [isSignedIn]);
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSubmit = async () => {
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

    setIsSubmitting(true);
    if (isCreatingAccount) {
      const result = await signUp(displayName, cleanEmail, password);
      setNotice(result.error ?? (result.confirmationSent
        ? 'Te enviamos un correo para confirmar tu cuenta. Ábrelo desde este teléfono y luego ingresa.'
        : 'Tu cuenta quedó creada. Ya puedes empezar a patinar.'));
    } else {
      const error = await signIn(cleanEmail, password);
      setNotice(error);
    }
    setIsSubmitting(false);
  };

  const changeMode = () => {
    setIsCreatingAccount((current) => !current);
    setNotice(null);
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
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
            <Text style={styles.loginSubtitle}>{isCreatingAccount ? 'Tu cuenta personal funciona con todos tus grupos.' : 'Respalda tus recorridos y participa en los grupos que elijas.'}</Text>

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
              {notice ? <Text style={styles.authNotice}>{notice}</Text> : null}
              <Pressable accessibilityRole="button" disabled={isSubmitting} onPress={() => { void handleSubmit(); }} style={[styles.loginButton, isSubmitting && styles.loginButtonDisabled]}>
                {isSubmitting ? <ActivityIndicator color="#151515" /> : <Text style={styles.loginButtonText}>{isCreatingAccount ? 'Crear mi cuenta' : 'Ingresar'}</Text>}
              </Pressable>
              <Pressable accessibilityRole="button" disabled={isSubmitting} onPress={changeMode} style={styles.modeButton}>
                <Text style={styles.modeButtonText}>{isCreatingAccount ? 'Ya tengo cuenta · Ingresar' : '¿Primera vez? Crear cuenta'}</Text>
              </Pressable>
            </View>

            <View style={styles.safetyNote}>
              <Text style={styles.safetyNoteTitle}>Casco obligatorio</Text>
              <Text style={styles.safetyNoteText}>Todas las actividades requieren casco. La app te recordará esta regla al confirmar cada inscripción.</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={styles.modeButton}><Text style={styles.modeButtonText}>Continuar sin cuenta</Text></Pressable>
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
  loginContent: { alignItems: 'stretch', flexGrow: 1, gap: 15, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 170 },
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
  modeButton: { alignItems: 'center', paddingVertical: 5 },
  modeButtonText: { color: '#FF9A45', fontSize: 12, fontWeight: '800' },
  safetyNote: { backgroundColor: '#21180F', borderLeftColor: '#FF7900', borderLeftWidth: 4, borderRadius: 12, padding: 14 },
  safetyNoteTitle: { color: '#FFB35F', fontSize: 12, fontWeight: '900' },
  safetyNoteText: { color: '#D5C3B2', fontSize: 11, lineHeight: 16, marginTop: 4 },
  loginFoot: { color: '#777777', fontSize: 10, textAlign: 'center' },
  content: { gap: 18, padding: 20, paddingBottom: 64 },
  topBar: { alignItems: 'center', flexDirection: 'row', height: 54, justifyContent: 'center', position: 'relative' },
  brandIdentity: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  brandIconFrame: { alignItems: 'center', borderRadius: 20, height: 40, justifyContent: 'center', overflow: 'hidden', width: 40 },
  brandIcon: { height: 64, width: 64 },
  brandName: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  profile: { alignItems: 'center', backgroundColor: '#26201B', borderColor: '#7A4A23', borderRadius: 18, borderWidth: 1, minHeight: 40, justifyContent: 'center', paddingHorizontal: 13, position: 'absolute', right: 0 },
  profileText: { color: '#FFB35F', fontSize: 11, fontWeight: '900' },
  welcome: { marginTop: 8 },
  welcomeTitle: { color: '#F6F6F6', fontSize: 25, fontWeight: '900' },
  welcomeSubtitle: { color: '#A8A8A8', fontSize: 13, marginTop: 3 },
  heading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  headingTitle: { color: '#F5F5F5', fontSize: 17, fontWeight: '800' },
  headingLink: { color: '#FF7900', fontSize: 12, fontWeight: '800' },
  activityCard: { backgroundColor: '#15191C', borderColor: '#374049', borderRadius: 19, borderWidth: 1, minHeight: 245, overflow: 'hidden', position: 'relative' },
  activityWatermark: { height: 205, opacity: 0.2, position: 'absolute', right: -18, top: -7, width: 205 },
  activityShade: { backgroundColor: 'rgba(0,0,0,0.32)', bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  dateBadge: { alignItems: 'center', backgroundColor: '#171717', borderColor: '#4A4A4A', borderRadius: 13, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 7, position: 'absolute', right: 13, top: 13, zIndex: 2 },
  dateDay: { color: '#CFCFCF', fontSize: 9, fontWeight: '900' },
  dateNumber: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', lineHeight: 26 },
  dateMonth: { color: '#FF7900', fontSize: 9, fontWeight: '900' },
  activityContent: { bottom: 17, left: 18, position: 'absolute', right: 18 },
  activityType: { color: '#FF9A45', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  activityTitle: { color: '#FFFFFF', fontSize: 21, fontWeight: '900', marginTop: 3 },
  activityPlace: { color: '#D8D8D8', fontSize: 11, fontWeight: '700', lineHeight: 16, marginTop: 4, paddingRight: 36 },
  activityMeta: { color: '#B9B9B9', fontSize: 10, fontWeight: '700', marginTop: 6 },
  activityActionRow: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between', marginTop: 14 },
  eventStartAction: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 8 },
  eventStartCircle: { alignItems: 'center', backgroundColor: '#24292E', borderColor: '#555E66', borderRadius: 20, borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
  eventStartCircleReady: { backgroundColor: '#FF7900', borderColor: '#FF9A45' },
  eventStartLabel: { color: '#B0B5BA', flex: 1, fontSize: 8.5, fontWeight: '800', lineHeight: 11 },
  eventStartLabelReady: { color: '#FFB35F' },
  mainButton: { alignItems: 'center', backgroundColor: '#FF7900', borderRadius: 11, minWidth: 112, paddingHorizontal: 14, paddingVertical: 11 },
  mainButtonJoined: { backgroundColor: '#7FD34E' },
  mainButtonDisabled: { backgroundColor: '#3B3B3B' },
  mainButtonText: { color: '#111111', fontSize: 12, fontWeight: '900' },
  mainButtonTextJoined: { color: '#102008' },
  mainButtonTextDisabled: { color: '#D0D0D0' },
  loadingCard: { alignItems: 'center', backgroundColor: '#151515', borderColor: '#303030', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 20 },
  loadingCardText: { color: '#C8C8C8', fontSize: 12, fontWeight: '700' },
  noActivityCard: { backgroundColor: '#151515', borderColor: '#303030', borderRadius: 18, borderStyle: 'dashed', borderWidth: 1, padding: 19 },
  noActivityTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' },
  noActivityText: { color: '#A8A8A8', fontSize: 12, lineHeight: 17, marginTop: 5 },
  noActivityButton: { alignItems: 'center', borderColor: '#FF7900', borderRadius: 11, borderWidth: 1, marginTop: 14, paddingVertical: 11 },
  noActivityButtonText: { color: '#FF9A45', fontSize: 12, fontWeight: '900' },
  routeLauncher: { alignItems: 'center', paddingVertical: 5 },
  routeLaunchButton: { alignItems: 'center', height: 78, justifyContent: 'center', width: 78 },
  routeLaunchTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', marginTop: 10 },
  routeLaunchSub: { color: '#909090', fontSize: 10, marginTop: 3 },
  myActivitiesCard: { backgroundColor: '#121212', borderColor: '#2C2C2C', borderRadius: 16, borderWidth: 1, padding: 15 },
  myActivitiesSectionTitle: { color: '#FF9A45', fontSize: 11, fontWeight: '900', letterSpacing: 0.35, marginBottom: 4, textTransform: 'uppercase' },
  myActivitiesEmpty: { color: '#989898', flex: 1, fontSize: 11, lineHeight: 16, paddingVertical: 7 },
  myActivitiesLoading: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  myActivitiesDivider: { backgroundColor: '#2B2B2B', height: 1, marginVertical: 13 },
  myActivityRow: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingVertical: 8 },
  myActivityIcon: { alignItems: 'center', backgroundColor: '#26351F', borderRadius: 10, height: 36, justifyContent: 'center', width: 36 },
  myActivityIconGps: { backgroundColor: '#32200E' },
  myActivityIconText: { color: '#FF8A24', fontSize: 17, fontWeight: '900' },
  myActivityInfo: { flex: 1 },
  myActivityTitle: { color: '#EEEEEE', fontSize: 12, fontWeight: '800' },
  myActivityMeta: { color: '#929292', fontSize: 10, lineHeight: 14, marginTop: 2 },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { alignItems: 'center', backgroundColor: '#151515', borderColor: '#292929', borderRadius: 14, borderWidth: 1, flex: 1, minHeight: 82, justifyContent: 'center', padding: 9 },
  statValue: { color: '#FFFFFF', fontSize: 23, fontWeight: '900' },
  statLabel: { color: '#9E9E9E', fontSize: 10, lineHeight: 13, marginTop: 4, textAlign: 'center' },
  footer: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 7 },
  footerLine: { backgroundColor: '#FF7900', height: 1, width: 35 },
  footerText: { color: '#BFBFBF', fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  copyright: { color: '#666666', fontSize: 9, marginTop: -8, textAlign: 'center' },
});
