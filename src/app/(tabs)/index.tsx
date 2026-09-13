import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GpsTargetIcon } from '@/components/gps-target-icon';
import { useDemoSession } from '@/contexts/demo-session';
import { formatShortMonth, formatShortWeekDay, getActivityTiming, getUpcomingActivity, type AppActivity } from '@/data/activities';
import { useActivities } from '@/hooks/use-activities';
import { useUserActivities, type UserActivity } from '@/hooks/use-user-activities';

const officialLogo = require('@/assets/images/rollersmaps-app-icon.png');
const transparentLogo = require('@/assets/images/rollersmaps-adaptive-foreground.png');

export default function HomeScreen() {
  const router = useRouter();
  const { isLoading: isSessionLoading, isSignedIn, isJoined, profile, signOut, toggleActivity } = useDemoSession();
  const { activities, error: activitiesError, isLoading: areActivitiesLoading, refresh } = useActivities(isSignedIn);
  const { activities: savedActivities, error: savedActivitiesError, isLoading: areSavedActivitiesLoading } = useUserActivities(isSignedIn);
  const [referenceTime, setReferenceTime] = useState(() => new Date());
  const nextActivity = getUpcomingActivity(activities, referenceTime);
  const joined = nextActivity ? isJoined(nextActivity.id) : false;
  const nextActivityTiming = nextActivity ? getActivityTiming(nextActivity, referenceTime) : null;
  const nextActivityRemaining = nextActivity ? Math.max(0, nextActivity.capacity - nextActivity.participants) : 0;
  const isNextActivityFull = Boolean(nextActivity && !joined && nextActivityRemaining === 0);
  const joinedActivities = activities.filter((activity) => isJoined(activity.id));
  const joinedActivityCount = joinedActivities.length;
  const firstName = profile?.displayName?.trim().split(/\s+/)[0];
  const totalDistanceKm = savedActivities.reduce((total, activity) => total + activity.distanceKm, 0);
  const totalDurationSeconds = savedActivities.reduce((total, activity) => total + activity.durationSeconds, 0);

  useEffect(() => {
    const interval = setInterval(() => setReferenceTime(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const handleSignOut = () => {
    void signOut();
    router.replace('/');
  };

  if (isSessionLoading) {
    return <LoadingScreen />;
  }

  if (!isSignedIn) {
    return <AuthScreen />;
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <View style={styles.brandIdentity}>
              <Image source={transparentLogo} resizeMode="contain" style={styles.brandIcon} />
              <Text style={styles.brandName}>RollersMaps</Text>
            </View>
            <Pressable accessibilityLabel="Cerrar sesión" accessibilityRole="button" onPress={handleSignOut} style={styles.profile}>
              <Text style={styles.profileText}>Salir</Text>
            </Pressable>
          </View>

          <View style={styles.welcome}>
            <Text style={styles.welcomeTitle}>{firstName ? `¡Hola, ${firstName}!` : '¡Hola, patinador!'}</Text>
            <Text style={styles.welcomeSubtitle}>Patinamos juntos con Santiago Rollers</Text>
          </View>

          <View style={styles.heading}>
            <Text style={styles.headingTitle}>Próxima actividad</Text>
            <Pressable accessibilityLabel="Ver calendario de actividades" accessibilityRole="button" hitSlop={10} onPress={() => router.navigate('/calendar')}>
              <Text style={styles.headingLink}>Ver calendario</Text>
            </Pressable>
          </View>

          {areActivitiesLoading ? <ActivityLoadingCard /> : nextActivity ? (
            <View style={styles.activityCard}>
              <Image source={officialLogo} resizeMode="contain" style={styles.activityWatermark} />
              <View style={styles.activityShade} />
              <View style={styles.dateBadge}>
                <Text style={styles.dateDay}>{formatShortWeekDay(nextActivity.date)}</Text>
                <Text style={styles.dateNumber}>{nextActivity.date.getDate().toString().padStart(2, '0')}</Text>
                <Text style={styles.dateMonth}>{formatShortMonth(nextActivity.date)}</Text>
              </View>
              <View style={styles.activityContent}>
                <Text style={styles.activityType}>{nextActivity.type === 'clase' ? 'CLASE' : nextActivity.type === 'especial' ? 'ACTIVIDAD ESPECIAL' : nextActivity.type === 'social' ? 'PATÍN SOCIAL' : 'RUTA'}</Text>
                <Text style={styles.activityTitle}>{nextActivity.title}</Text>
                <Text style={styles.activityPlace}>{nextActivity.time} · {nextActivity.meetingPoint}</Text>
                {nextActivity.level ? <Text style={styles.activityMeta}>{nextActivity.level}{nextActivity.difficulty ? ` · ${nextActivity.difficulty}` : ''}</Text> : null}
                <View style={styles.activityActionRow}>
                  <View style={styles.eventStartAction}>
                    <Pressable
                      accessibilityLabel={!joined ? 'Inscríbete para registrar esta actividad' : nextActivityTiming?.hasEnded ? `${nextActivity.title}, actividad finalizada` : nextActivityTiming?.canStart ? `Registrar ${nextActivity.title}` : `${nextActivity.title} se habilita a partir de las ${nextActivity.time}`}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: !joined || !nextActivityTiming?.canStart }}
                      disabled={!joined || !nextActivityTiming?.canStart}
                      onPress={() => router.navigate({ pathname: '/track', params: { activityId: nextActivity.id } })}
                      style={[styles.eventStartCircle, nextActivityTiming?.canStart && joined && styles.eventStartCircleReady]}>
                      <GpsTargetIcon color={nextActivityTiming?.canStart && joined ? '#111111' : '#FF7900'} size={18} />
                    </Pressable>
                    <Text numberOfLines={3} style={[styles.eventStartLabel, nextActivityTiming?.canStart && joined && styles.eventStartLabelReady]}>{!joined ? 'Inscríbete primero' : nextActivityTiming?.hasEnded ? 'Actividad finalizada' : nextActivityTiming?.canStart ? 'Registrar actividad' : `Se habilita a partir de las ${nextActivity.time}`}</Text>
                  </View>
                  <Pressable
                    accessibilityLabel={joined ? `Cancelar inscripción en ${nextActivity.title}` : isNextActivityFull ? `${nextActivity.title}, sin cupos disponibles` : `Inscribirme en ${nextActivity.title}`}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: isNextActivityFull, selected: joined }}
                    disabled={isNextActivityFull}
                    onPress={() => { void toggleActivity(nextActivity.id); }}
                    style={[styles.mainButton, joined && styles.mainButtonJoined, isNextActivityFull && styles.mainButtonDisabled]}>
                    <Text style={[styles.mainButtonText, joined && styles.mainButtonTextJoined, isNextActivityFull && styles.mainButtonTextDisabled]}>
                      {joined ? 'Inscrito' : isNextActivityFull ? 'Sin cupos' : 'Inscribirme'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.noActivityCard}>
              <Text style={styles.noActivityTitle}>{activitiesError ? 'No pudimos cargar la agenda' : 'Sin actividades próximas'}</Text>
              <Text style={styles.noActivityText}>{activitiesError ? 'Revisa que la función de agenda de Supabase esté publicada y vuelve a intentarlo.' : 'Cuando el equipo publique una nueva clase, ruta o actividad especial, aparecerá aquí.'}</Text>
              <Pressable onPress={() => { void refresh(); }} style={styles.noActivityButton}><Text style={styles.noActivityButtonText}>{activitiesError ? 'Reintentar' : 'Actualizar agenda'}</Text></Pressable>
            </View>
          )}

          <View style={styles.routeLauncher}>
            <Pressable accessibilityLabel="Registrar una actividad con GPS" accessibilityRole="button" onPress={() => router.navigate('/track')} style={styles.routeLaunchButton}>
              <GpsTargetIcon color="#FF7900" size={62} />
            </Pressable>
            <Text style={styles.routeLaunchTitle}>Registrar actividad</Text>
            <Text style={styles.routeLaunchSub}>Abre el mapa y el GPS a pantalla completa.</Text>
          </View>

          <View style={styles.heading}>
            <Text style={styles.headingTitle}>Mis actividades</Text>
            <Pressable accessibilityLabel="Ver todas mis actividades" accessibilityRole="button" hitSlop={10} onPress={() => router.navigate('/my-activities' as never)}>
              <Text style={styles.headingLink}>Ver todas · {joinedActivityCount + savedActivities.length}</Text>
            </Pressable>
          </View>
          <View style={styles.myActivitiesCard}>
            <Text style={styles.myActivitiesSectionTitle}>Próxima inscripción del grupo</Text>
            {joinedActivities.length ? joinedActivities.slice(0, 1).map((activity) => (
              <JoinedActivityRow activity={activity} key={activity.id} />
            )) : (
              <Text style={styles.myActivitiesEmpty}>Todavía no te has inscrito. Cuando reserves un cupo, lo verás acá.</Text>
            )}

            <View style={styles.myActivitiesDivider} />
            <Text style={styles.myActivitiesSectionTitle}>Último registro GPS</Text>
            {areSavedActivitiesLoading ? (
              <View style={styles.myActivitiesLoading}><ActivityIndicator color="#FF7900" size="small" /><Text style={styles.myActivitiesEmpty}>Cargando tus recorridos…</Text></View>
            ) : savedActivities.length ? savedActivities.slice(0, 1).map((activity) => (
              <SavedActivityRow activity={activity} key={activity.id} />
            )) : (
              <Text style={styles.myActivitiesEmpty}>{savedActivitiesError ? 'Falta activar el historial privado en Supabase.' : 'Aún no guardas recorridos. Toca Registrar actividad para guardar el primero.'}</Text>
            )}
          </View>

          <View style={styles.heading}>
            <Text style={styles.headingTitle}>Resumen</Text>
            <Text style={styles.headingLink}>Mi cuenta</Text>
          </View>
          <View style={styles.stats}>
            <Stat value={areSavedActivitiesLoading ? '—' : formatSummaryDistance(totalDistanceKm)} label={'Kilómetros\nrecorridos'} />
            <Stat value={areSavedActivitiesLoading ? '—' : formatSummaryHours(totalDurationSeconds)} label={'Horas de\nactividad'} />
            <Stat value={areSavedActivitiesLoading ? '—' : savedActivities.length.toString()} label={'Registros\nGPS'} />
          </View>

          <View style={styles.footer}><View style={styles.footerLine} /><Text style={styles.footerText}>PATINAMOS JUNTOS</Text><View style={styles.footerLine} /></View>
          <Text style={styles.copyright}>© 2026 Manuel Salinas · Todos los derechos reservados</Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function AuthScreen() {
  const { signIn, signUp } = useDemoSession();
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
            <Text style={styles.loginSubtitle}>{isCreatingAccount ? 'Crea tu cuenta para conocer las rutas y anotarte a las actividades.' : 'Ingresa para ver la agenda de Santiago Rollers y reservar tu cupo.'}</Text>

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
            <Text style={styles.loginFoot}>Tus inscripciones se sincronizan con la agenda del grupo.</Text>
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

function LoadingScreen() {
  return (
    <View style={[styles.screen, styles.loadingScreen]}>
      <StatusBar style="light" />
      <ActivityIndicator color="#FF7900" size="large" />
      <Text style={styles.loadingText}>Preparando RollersMaps…</Text>
    </View>
  );
}

function ActivityLoadingCard() {
  return <View style={styles.loadingCard}><ActivityIndicator color="#FF7900" /><Text style={styles.loadingCardText}>Cargando la agenda del grupo…</Text></View>;
}

function Stat({ value, label }: { value: string; label: string }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

function JoinedActivityRow({ activity }: { activity: AppActivity }) {
  const date = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', weekday: 'short' }).format(activity.date).replace('.', '');

  return (
    <View style={styles.myActivityRow}>
      <View style={styles.myActivityIcon}><Text style={styles.myActivityIconText}>✓</Text></View>
      <View style={styles.myActivityInfo}>
        <Text style={styles.myActivityTitle}>{activity.title}</Text>
        <Text style={styles.myActivityMeta}>{date} · {activity.time} · {activity.meetingPoint}</Text>
      </View>
    </View>
  );
}

function SavedActivityRow({ activity }: { activity: UserActivity }) {
  const date = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', weekday: 'short' }).format(activity.startedAt).replace('.', '');
  const minutes = Math.max(1, Math.round(activity.durationSeconds / 60));

  return (
    <View style={styles.myActivityRow}>
      <View style={[styles.myActivityIcon, styles.myActivityIconGps]}><Text style={styles.myActivityIconText}>⌖</Text></View>
      <View style={styles.myActivityInfo}>
        <Text style={styles.myActivityTitle}>{activity.title}</Text>
        <Text style={styles.myActivityMeta}>{date} · {minutes} min · {activity.distanceKm.toFixed(2)} km</Text>
      </View>
    </View>
  );
}

function formatSummaryDistance(distanceKm: number) {
  const decimals = distanceKm >= 100 ? 0 : distanceKm >= 10 ? 1 : 2;
  return `${distanceKm.toFixed(decimals).replace('.', ',')} km`;
}

function formatSummaryHours(durationSeconds: number) {
  const totalHours = durationSeconds / 3600;
  const decimals = totalHours > 0 && totalHours < 1 ? 2 : 1;
  return `${totalHours.toFixed(decimals).replace('.', ',')} h`;
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
