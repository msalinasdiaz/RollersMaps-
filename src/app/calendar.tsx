import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useDemoSession } from '@/contexts/demo-session';
import {
  activitiesForDate,
  activityTypeColors,
  activityTypeLabels,
  formatShortMonth,
  formatShortWeekDay,
  getUpcomingActivity,
  type AppActivity,
} from '@/data/activities';
import { useActivities } from '@/hooks/use-activities';

const officialLogo = require('@/assets/images/rollersmaps-app-icon.png');

type CalendarDay = {
  date: Date;
  activities: readonly AppActivity[];
};

function formatWeekRange(start: Date, end: Date) {
  const monthFormatter = new Intl.DateTimeFormat('es-CL', { month: 'long' });
  const startMonth = monthFormatter.format(start);
  const endMonth = monthFormatter.format(end);

  return start.getMonth() === end.getMonth()
    ? `Del ${start.getDate()} al ${end.getDate()} de ${startMonth}`
    : `Del ${start.getDate()} de ${startMonth} al ${end.getDate()} de ${endMonth}`;
}

export default function CalendarScreen() {
  const { isSignedIn, signOut, isJoined, toggleActivity } = useDemoSession();
  const { activities, isLoading } = useActivities(isSignedIn);
  const [referenceDate] = useState(() => new Date());
  const weekDays = useMemo<CalendarDay[]>(() => {
    const firstDay = new Date(referenceDate);
    firstDay.setHours(0, 0, 0, 0);

    return Array.from({ length: 7 }, (_, offset) => {
      const date = new Date(firstDay);
      date.setDate(firstDay.getDate() + offset);
      return { date, activities: activitiesForDate(activities, date) };
    });
  }, [activities, referenceDate]);

  const upcoming = getUpcomingActivity(activities, referenceDate);
  const weekStart = weekDays[0]?.date;
  const weekEnd = weekDays.at(-1)?.date;
  const weekActivityCount = weekDays.reduce((count, day) => count + day.activities.length, 0);
  const handleSignOut = () => {
    signOut();
    router.replace('/');
  };

  if (!isSignedIn) {
    return <SignInRequired />;
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Header onSignOut={handleSignOut} />

          <View>
            <Text style={styles.title}>Calendario</Text>
            <Text style={styles.subtitle}>Revisa las actividades que el equipo tiene programadas para los próximos siete días.</Text>
          </View>

          <View style={styles.weekCard}>
            <View style={styles.weekCardTop}>
              <View>
                <Text style={styles.weekEyebrow}>PRÓXIMOS 7 DÍAS</Text>
                <Text style={styles.weekTitle}>{weekStart && weekEnd ? formatWeekRange(weekStart, weekEnd) : 'Esta semana'}</Text>
              </View>
              <View style={styles.countBadge}>
                <Text style={styles.countValue}>{weekActivityCount}</Text>
                <Text style={styles.countLabel}>actividades</Text>
              </View>
            </View>
            {upcoming ? (
              <View style={styles.nextLine}>
                <View style={styles.nextDot} />
                <Text style={styles.nextText}>Próxima: {upcoming.title} · {formatShortWeekDay(upcoming.date)} {upcoming.date.getDate()} · {upcoming.time}</Text>
              </View>
            ) : (
              <Text style={styles.nextText}>Aún no hay actividades confirmadas.</Text>
            )}
          </View>

          <View style={styles.legend}>
            <Legend type="clase" />
            <Legend type="ruta" />
            <Legend type="especial" />
            <Legend type="social" />
          </View>

          {isLoading ? (
            <AgendaLoading />
          ) : weekActivityCount ? (
            <View style={styles.agenda}>
              {weekDays.map((day) => (
                <DayAgenda
                  key={day.date.toISOString()}
                  date={day.date}
                  activities={day.activities}
                  isJoined={isJoined}
                  onToggleActivity={toggleActivity}
                  referenceDate={referenceDate}
                />
              ))}
            </View>
          ) : (
            <EmptyWeek />
          )}

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Cómo leer la agenda</Text>
            <Text style={styles.infoText}>Tu nivel técnico indica a qué rutas puedes sumarte. La dificultad te avisa la exigencia de cada salida. Si una semana no tiene publicaciones, aquí verás “Sin actividades”.</Text>
          </View>

          <View style={styles.safety}>
            <Text style={styles.safetyTitle}>Casco obligatorio</Text>
            <Text style={styles.safetyText}>Antes de inscribirte, revisa el nivel, el punto de encuentro y las indicaciones de la actividad.</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Header({ onSignOut }: { onSignOut: () => void }) {
  return (
    <View style={styles.topBar}>
      <View style={styles.brandIdentity}>
        <View style={styles.brandIconFrame}>
          <Image source={officialLogo} resizeMode="contain" style={styles.brandIcon} />
        </View>
        <Text style={styles.brandName}>RollersMaps</Text>
      </View>
      <Pressable accessibilityLabel="Cerrar sesión" accessibilityRole="button" onPress={onSignOut} style={styles.profile}>
        <Text style={styles.profileText}>Salir</Text>
      </Pressable>
    </View>
  );
}

function Legend({ type }: { type: keyof typeof activityTypeLabels }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: activityTypeColors[type] }]} />
      <Text style={styles.legendText}>{activityTypeLabels[type]}</Text>
    </View>
  );
}

function DayAgenda({
  date,
  activities,
  isJoined,
  onToggleActivity,
  referenceDate,
}: {
  date: Date;
  activities: readonly AppActivity[];
  isJoined: (activityId: string) => boolean;
  onToggleActivity: (activityId: string) => void | Promise<void>;
  referenceDate: Date;
}) {
  const today = referenceDate;
  const isToday = date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();

  return (
    <View style={styles.dayRow}>
      <View style={[styles.dateColumn, isToday && styles.dateColumnToday]}>
        <Text style={[styles.dayName, isToday && styles.dayNameToday]}>{isToday ? 'HOY' : formatShortWeekDay(date)}</Text>
        <Text style={styles.dayNumber}>{date.getDate().toString().padStart(2, '0')}</Text>
        <Text style={styles.dayMonth}>{formatShortMonth(date)}</Text>
      </View>
      <View style={styles.dayContent}>
        {activities.length ? activities.map((activity) => (
          <ActivityCard
            activity={activity}
            date={date}
            isJoined={isJoined(activity.id)}
            key={activity.id}
            onToggle={() => onToggleActivity(activity.id)}
            referenceDate={referenceDate}
          />
        )) : (
          <View style={styles.emptyDay}>
            <Text style={styles.emptyDayTitle}>Sin actividades</Text>
            <Text style={styles.emptyDayText}>No hay actividades programadas para este día.</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function ActivityCard({ activity, date, isJoined, onToggle, referenceDate }: { activity: AppActivity; date: Date; isJoined: boolean; onToggle: () => void | Promise<void>; referenceDate: Date }) {
  const color = activityTypeColors[activity.type];
  const remaining = Math.max(0, activity.capacity - activity.participants);
  const scheduledFor = new Date(date);
  const [hours, minutes] = activity.time.split(':').map(Number);
  scheduledFor.setHours(hours, minutes, 0, 0);
  const hasEnded = scheduledFor.getTime() < referenceDate.getTime();
  const isUnavailable = !isJoined && remaining === 0;

  return (
    <View style={[styles.activityCard, isJoined && !hasEnded && styles.activityCardJoined, hasEnded && styles.activityCardPast]}>
      <View style={styles.activityCardTop}>
        <View style={[styles.typePill, { borderColor: color }]}>
          <View style={[styles.typeDot, { backgroundColor: color }]} />
          <Text style={[styles.typeText, { color }]}>{activityTypeLabels[activity.type]}</Text>
        </View>
        <Text style={styles.time}>{activity.time}</Text>
      </View>
      <Text style={styles.activityTitle}>{activity.title}</Text>
      <Text style={styles.place}>Punto de encuentro: {activity.meetingPoint}</Text>
      {activity.endingPoint ? <Text style={styles.place}>Termina en: {activity.endingPoint}</Text> : null}
      {activity.level || activity.difficulty ? (
        <View style={styles.metaRow}>
          {activity.level ? <Text style={styles.metaPill}>{activity.level}</Text> : null}
          {activity.difficulty ? <Text style={styles.metaPill}>{activity.difficulty}</Text> : null}
        </View>
      ) : null}
      {activity.note ? <Text style={styles.note}>{activity.note}</Text> : null}
      <View style={styles.activityFooter}>
        <Text style={styles.capacity}>{hasEnded ? 'Actividad finalizada' : isJoined ? `${activity.participants} ${activity.participants === 1 ? 'participante' : 'participantes'}` : remaining ? `${remaining} cupos disponibles` : 'Sin cupos disponibles'}</Text>
        <Pressable
          accessibilityLabel={hasEnded ? `${activity.title}, actividad finalizada` : isJoined ? `Cancelar inscripción en ${activity.title}` : `Inscribirme en ${activity.title}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: hasEnded || isUnavailable, selected: isJoined && !hasEnded }}
          disabled={hasEnded || isUnavailable}
          onPress={onToggle}
          style={[styles.joinButton, isJoined && !hasEnded && styles.joinButtonJoined, (hasEnded || isUnavailable) && styles.joinButtonDisabled]}>
          <Text style={[styles.joinButtonText, isJoined && !hasEnded && styles.joinButtonTextJoined, (hasEnded || isUnavailable) && styles.joinButtonTextDisabled]}>{hasEnded ? 'Finalizada' : isJoined ? 'Inscrito' : 'Inscribirme'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function EmptyWeek() {
  return (
    <View style={styles.emptyWeek}>
      <View style={styles.emptyWeekIcon}>
        <Image source={officialLogo} resizeMode="contain" style={styles.emptyWeekImage} />
      </View>
      <Text style={styles.emptyWeekTitle}>Sin actividades esta semana</Text>
      <Text style={styles.emptyWeekText}>Cuando el equipo publique una clase, ruta o actividad especial, aparecerá aquí con todos sus detalles.</Text>
    </View>
  );
}

function AgendaLoading() {
  return (
    <View style={styles.emptyWeek}>
      <Text style={styles.emptyWeekTitle}>Cargando agenda</Text>
      <Text style={styles.emptyWeekText}>Estamos buscando las actividades publicadas por el equipo.</Text>
    </View>
  );
}

function SignInRequired() {
  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.requiredSafe} edges={['top']}>
        <View style={styles.requiredContent}>
          <View style={styles.requiredLogoFrame}>
            <Image source={officialLogo} resizeMode="contain" style={styles.requiredLogo} />
          </View>
          <Text style={styles.requiredTitle}>Tu agenda está lista</Text>
          <Text style={styles.requiredText}>Ingresa desde Inicio para revisar e inscribirte en las actividades de la semana.</Text>
          <Pressable accessibilityRole="button" onPress={() => router.navigate('/')} style={styles.requiredButton}>
            <Text style={styles.requiredButtonText}>Ir a Inicio</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#070707' },
  safeArea: { flex: 1 },
  content: { gap: 16, padding: 20, paddingBottom: 64 },
  topBar: { alignItems: 'center', flexDirection: 'row', height: 54, justifyContent: 'space-between' },
  brandIdentity: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  brandIconFrame: { alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 19, height: 38, justifyContent: 'center', overflow: 'hidden', width: 38 },
  brandIcon: { height: 38, width: 38 },
  brandName: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  profile: { alignItems: 'center', backgroundColor: '#26201B', borderColor: '#7A4A23', borderRadius: 18, borderWidth: 1, minHeight: 40, justifyContent: 'center', paddingHorizontal: 13 },
  profileText: { color: '#FFB35F', fontSize: 11, fontWeight: '900' },
  title: { color: '#FFFFFF', fontSize: 30, fontWeight: '900', marginTop: 7 },
  subtitle: { color: '#ADADAD', fontSize: 13, lineHeight: 19, marginTop: 4 },
  weekCard: { backgroundColor: '#18130F', borderColor: '#714319', borderRadius: 18, borderWidth: 1, gap: 11, padding: 16 },
  weekCardTop: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  weekEyebrow: { color: '#FF9A45', fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  weekTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '900', marginTop: 4, textTransform: 'capitalize' },
  countBadge: { alignItems: 'center', backgroundColor: '#2A2019', borderColor: '#8A5425', borderRadius: 12, borderWidth: 1, minWidth: 66, paddingHorizontal: 8, paddingVertical: 6 },
  countValue: { color: '#FFB35F', fontSize: 17, fontWeight: '900', lineHeight: 19 },
  countLabel: { color: '#D9B28A', fontSize: 8, fontWeight: '800' },
  nextLine: { alignItems: 'flex-start', flexDirection: 'row', gap: 7 },
  nextDot: { backgroundColor: '#7FD34E', borderRadius: 4, height: 8, marginTop: 4, width: 8 },
  nextText: { color: '#E7D6C4', flex: 1, fontSize: 11, fontWeight: '700', lineHeight: 15 },
  legend: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  legendItem: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  legendDot: { borderRadius: 4, height: 8, width: 8 },
  legendText: { color: '#BFBFBF', fontSize: 10, fontWeight: '800' },
  pastToggle: { backgroundColor: '#131313', borderColor: '#343434', borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  pastToggleTitle: { color: '#FF9A45', fontSize: 12, fontWeight: '900' },
  pastToggleText: { color: '#AFAFAF', fontSize: 10, lineHeight: 14, marginTop: 3 },
  agenda: { gap: 13 },
  dayRow: { flexDirection: 'row', gap: 11 },
  dateColumn: { alignItems: 'center', backgroundColor: '#161616', borderColor: '#303030', borderRadius: 15, borderWidth: 1, minHeight: 103, paddingTop: 13, width: 58 },
  dateColumnToday: { backgroundColor: '#24180F', borderColor: '#FF7900' },
  dayName: { color: '#BDBDBD', fontSize: 9, fontWeight: '900' },
  dayNameToday: { color: '#FFB35F' },
  dayNumber: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', lineHeight: 28, marginTop: 3 },
  dayMonth: { color: '#FF9A45', fontSize: 9, fontWeight: '900' },
  dayContent: { flex: 1, gap: 9 },
  activityCard: { backgroundColor: '#151515', borderColor: '#303030', borderRadius: 16, borderWidth: 1, gap: 7, padding: 13 },
  activityCardJoined: { borderColor: '#7FD34E', backgroundColor: '#10170D' },
  activityCardPast: { backgroundColor: '#111111', borderColor: '#262626' },
  activityCardTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  typePill: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 8, paddingVertical: 4 },
  typeDot: { borderRadius: 3, height: 6, width: 6 },
  typeText: { fontSize: 9, fontWeight: '900' },
  time: { color: '#F0F0F0', fontSize: 12, fontWeight: '900' },
  activityTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', lineHeight: 20 },
  place: { color: '#C9C9C9', fontSize: 10, fontWeight: '600', lineHeight: 14 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 1 },
  metaPill: { backgroundColor: '#262626', borderRadius: 8, color: '#DDDDDD', fontSize: 9, fontWeight: '800', overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 5 },
  note: { color: '#FFB35F', fontSize: 10, fontWeight: '700', lineHeight: 14 },
  activityFooter: { alignItems: 'center', flexDirection: 'row', gap: 9, justifyContent: 'space-between', marginTop: 4 },
  capacity: { color: '#A6A6A6', flex: 1, fontSize: 9, fontWeight: '700' },
  joinButton: { alignItems: 'center', backgroundColor: '#FF7900', borderRadius: 10, minWidth: 88, paddingHorizontal: 10, paddingVertical: 9 },
  joinButtonJoined: { backgroundColor: '#7FD34E' },
  joinButtonDisabled: { backgroundColor: '#404040' },
  joinButtonText: { color: '#141414', fontSize: 10, fontWeight: '900' },
  joinButtonTextJoined: { color: '#102008' },
  joinButtonTextDisabled: { color: '#D0D0D0' },
  emptyDay: { alignItems: 'flex-start', backgroundColor: '#111111', borderColor: '#282828', borderRadius: 16, borderStyle: 'dashed', borderWidth: 1, minHeight: 90, justifyContent: 'center', padding: 14 },
  emptyDayTitle: { color: '#CACACA', fontSize: 12, fontWeight: '900' },
  emptyDayText: { color: '#858585', fontSize: 10, lineHeight: 14, marginTop: 4 },
  emptyWeek: { alignItems: 'center', backgroundColor: '#151515', borderColor: '#303030', borderRadius: 20, borderStyle: 'dashed', borderWidth: 1, padding: 28 },
  emptyWeekIcon: { alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 38, height: 76, justifyContent: 'center', overflow: 'hidden', width: 76 },
  emptyWeekImage: { height: 76, width: 76 },
  emptyWeekTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '900', marginTop: 15 },
  emptyWeekText: { color: '#A7A7A7', fontSize: 12, lineHeight: 17, marginTop: 6, textAlign: 'center' },
  infoCard: { backgroundColor: '#14191F', borderColor: '#34404E', borderRadius: 15, borderWidth: 1, padding: 15 },
  infoTitle: { color: '#B9D8FF', fontSize: 12, fontWeight: '900' },
  infoText: { color: '#C2CAD5', fontSize: 11, lineHeight: 16, marginTop: 5 },
  safety: { backgroundColor: '#21180F', borderLeftColor: '#FF7900', borderLeftWidth: 4, borderRadius: 12, padding: 14 },
  safetyTitle: { color: '#FFB35F', fontSize: 12, fontWeight: '900' },
  safetyText: { color: '#D5C3B2', fontSize: 11, lineHeight: 16, marginTop: 4 },
  requiredSafe: { flex: 1 },
  requiredContent: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 30 },
  requiredLogoFrame: { alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 54, height: 108, justifyContent: 'center', overflow: 'hidden', width: 108 },
  requiredLogo: { height: 108, width: 108 },
  requiredTitle: { color: '#FFFFFF', fontSize: 23, fontWeight: '900', marginTop: 22 },
  requiredText: { color: '#A8A8A8', fontSize: 13, lineHeight: 19, marginTop: 8, textAlign: 'center' },
  requiredButton: { alignItems: 'center', backgroundColor: '#FF7900', borderRadius: 12, marginTop: 22, paddingHorizontal: 24, paddingVertical: 14 },
  requiredButtonText: { color: '#121212', fontSize: 13, fontWeight: '900' },
});
