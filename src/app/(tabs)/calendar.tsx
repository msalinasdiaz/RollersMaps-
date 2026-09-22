import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Notice, Screen, ui } from '@/components/community-ui';
import { GroupLogo } from '@/components/group-logo';
import { useCommunity } from '@/contexts/community';
import { useDemoSession } from '@/contexts/demo-session';
import { activityTypeColors, activityTypeLabels, formatShortMonth, formatShortWeekDay, getActivityTiming, type AppActivity, type ActivityType } from '@/data/activities';
import { calendarWeek, sameDay, weekRange } from '@/lib/calendar';
import { canManageGroup } from '@/lib/group-permissions';

export default function Calendar() {
  const { groups, activities, isLoading, calendarError, groupsError, refresh } = useCommunity();
  const { isSignedIn, isJoined, toggleActivity } = useDemoSession();
  const [filter, setFilter] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const submitting = useRef(false);
  const [now, setNow] = useState(() => new Date());
  const [weekOffset, setWeekOffset] = useState(0);
  const [showEarlier, setShowEarlier] = useState(false);
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(timer); }, []);
  const own = groups.filter(group => group.membership_status === 'active');
  const selected = own.some(group => group.id === filter) ? filter : null;
  const filtered = activities.filter(activity => !selected || activity.groupId === selected);
  const days = calendarWeek(filtered, now, weekOffset);
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const earlier = weekOffset === 0 ? days.filter(day => day.date < todayStart).length : 0;
  const shownDays = days.filter(day => showEarlier || weekOffset !== 0 || day.date >= todayStart);
  const weekActivities = days.flatMap(day => day.activities);
  const next = weekActivities.find(activity => !getActivityTiming(activity, now).hasEnded);
  async function toggle(id: string) {
    if (submitting.current) return;
    submitting.current = true; setBusy(id);
    try { await toggleActivity(id); } finally { submitting.current = false; setBusy(null); }
  }
  function moveWeek(offset: number) { setWeekOffset(offset); setShowEarlier(false); }
  return <Screen title="Calendario" subtitle="Revisa las actividades que tus grupos tienen programadas para esta semana."
    backgroundColor="#070707" refresh={() => void refresh()} refreshing={isLoading && activities.length > 0}>
    {!isSignedIn ? <Notice title="Tu calendario comienza con una comunidad" text="Ingresa y únete a un grupo para ver sus actividades." action="Ingresar" onAction={() => router.push('/auth')} /> :
      isLoading && !groups.length ? <ActivityIndicator color="#FF9A45" /> :
      calendarError || groupsError ? <Notice title="No pudimos cargar el calendario" text="Revisa tu conexión. Puedes seguir patinando libremente." action="Reintentar" onAction={() => void refresh()} /> :
      !own.length ? <Notice title="Únete a tu primer grupo" text="Si ya enviaste una solicitud, el calendario se habilitará cuando te aprueben." action="Descubrir grupos" onAction={() => router.navigate('/groups')} /> : <>
        {own.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {[{ id: null, name: 'Todos' }, ...own].map(group => <Pressable key={group.id ?? 'all'} accessibilityRole="tab" accessibilityState={{ selected: group.id === selected }}
            onPress={() => setFilter(group.id)} style={[styles.filter, group.id === selected && styles.filterSelected]}>
            <Text style={ui.accent}>{group.name}</Text></Pressable>)}
        </ScrollView> : null}
        <View style={styles.weekCard}>
          <View style={styles.weekTop}><View style={{ flex: 1 }}><Text style={styles.eyebrow}>AGENDA SEMANAL</Text>
            <Text style={styles.weekTitle}>{weekRange(days[0].date, days[6].date)}</Text></View>
            <View style={styles.countBadge}><Text style={styles.count}>{weekActivities.length}</Text><Text style={styles.countLabel}>actividades</Text></View></View>
          {next ? <View style={styles.nextLine}><View style={[styles.dot, { backgroundColor: activityTypeColors[next.type] }]} />
            <Text style={styles.nextText}>Próxima actividad: {next.title} · {formatShortWeekDay(next.date)} {next.date.getDate()} · {next.time}</Text></View> :
            <Text style={styles.nextText}>No hay más actividades próximas esta semana.</Text>}
        </View>
        <View style={styles.weekNavigation}>
          <Pressable accessibilityRole="button" accessibilityLabel="Semana anterior" onPress={() => moveWeek(weekOffset - 1)} style={styles.weekButton}><Text style={styles.link}>‹ Anterior</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => moveWeek(0)} style={styles.weekButton}><Text style={weekOffset === 0 ? styles.currentWeek : styles.link}>Esta semana</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Semana siguiente" onPress={() => moveWeek(weekOffset + 1)} style={styles.weekButton}><Text style={styles.link}>Siguiente ›</Text></Pressable>
        </View>
        <View style={styles.legend}>{(Object.keys(activityTypeLabels) as ActivityType[]).map(type => <View style={styles.legendItem} key={type}>
          <View style={[styles.dot, { backgroundColor: activityTypeColors[type] }]} /><Text style={styles.legendText}>{activityTypeLabels[type]}</Text></View>)}</View>
        {earlier ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: showEarlier }} onPress={() => setShowEarlier(!showEarlier)} style={styles.pastToggle}>
          <Text style={styles.link}>{showEarlier ? 'Ocultar días anteriores' : 'Ver ' + earlier + (earlier === 1 ? ' día anterior' : ' días anteriores')}</Text>
          <Text style={styles.pastText}>La agenda parte desde hoy para que veas primero lo que viene.</Text></Pressable> : null}
        {!weekActivities.length ? <Notice title="Sin actividades esta semana" text="Revisa otra semana o vuelve cuando tus grupos publiquen nuevas actividades." /> :
          <View style={{ gap: 14 }}>{shownDays.map(day => <View style={styles.dayRow} key={day.date.toISOString()}>
            <View style={[styles.dateColumn, sameDay(day.date, now) && styles.dateToday]}>
              <Text style={[styles.dayName, sameDay(day.date, now) && styles.link]}>{sameDay(day.date, now) ? 'HOY' : formatShortWeekDay(day.date)}</Text>
              <Text style={styles.dayNumber}>{String(day.date.getDate()).padStart(2, '0')}</Text><Text style={styles.dayMonth}>{formatShortMonth(day.date)}</Text></View>
            <View style={styles.dayContent}>{day.activities.length ? day.activities.map(activity => {
              const group = own.find(item => item.id === activity.groupId);
              return <CalendarActivity key={activity.id} activity={activity} joined={isJoined(activity.id)} now={now} admin={canManageGroup(group)}
                logoPath={group?.logo_url} busy={busy === activity.id} disabled={busy !== null} onToggle={() => void toggle(activity.id)} />;
            }) : <View style={styles.emptyDay}><Text style={styles.emptyTitle}>Sin actividades</Text><Text style={styles.pastText}>No hay actividades programadas para este día.</Text></View>}</View>
          </View>)}</View>}
        <View style={styles.safety}><Text style={styles.link}>Casco obligatorio</Text><Text style={styles.pastText}>Antes de inscribirte, revisa el nivel, el punto de encuentro y las indicaciones de la actividad.</Text></View>
      </>}
  </Screen>;
}

export function CalendarActivity({ activity, joined, now, admin, logoPath, busy, disabled, onToggle }: {
  activity: AppActivity; joined: boolean; now: Date; admin: boolean; logoPath?: string | null; busy: boolean; disabled: boolean; onToggle: () => void;
}) {
  const timing = getActivityTiming(activity, now);
  const color = activityTypeColors[activity.type];
  const closed = activity.registrationOpen === false;
  const cannotRegister = timing.hasStarted || closed;
  const unavailable = disabled || timing.hasEnded || (!joined && cannotRegister);
  const label = timing.hasEnded ? 'Finalizada' : joined ? 'Cancelar inscripción' : timing.hasStarted ? 'En curso' : closed ? 'Inscripciones cerradas' : 'Inscribirme';
  const remaining = admin && activity.capacity != null && activity.participants != null ? Math.max(0, activity.capacity - activity.participants) : null;
  return <View style={[styles.activity, joined && !timing.hasEnded && styles.joinedActivity]}>
    <View style={styles.activityTop}><View style={[styles.typePill, { borderColor: color }]}><View style={[styles.smallDot, { backgroundColor: color }]} />
      <Text style={[styles.typeText, { color }]}>{activityTypeLabels[activity.type]}</Text></View><Text style={styles.time}>{activity.time}</Text></View>
    <View style={styles.groupLine}><GroupLogo name={activity.groupName} path={logoPath} size={22} /><Text style={styles.groupName}>{activity.groupName}</Text></View>
    <Text style={styles.activityTitle}>{activity.title}</Text>
    <Text style={styles.place}>Punto de encuentro: {activity.meetingPoint}</Text>
    {activity.endingPoint ? <Text style={styles.place}>Termina en: {activity.endingPoint}</Text> : null}
    <View style={styles.metadata}>{activity.level ? <Text style={styles.metaPill}>{activity.level}</Text> : null}{activity.difficulty ? <Text style={styles.metaPill}>{activity.difficulty}</Text> : null}</View>
    {activity.note ? <Text style={styles.note}>{activity.note}</Text> : null}
    {remaining !== null ? <Text style={styles.adminCount}>{remaining} cupos disponibles · {activity.participants} inscritos{'\n'}Solo administración</Text> : null}
    {joined && !timing.hasEnded ? <Text style={styles.confirmed}>Inscripción confirmada</Text> : null}
    {joined && timing.canStart ? <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/track', params: { activityId: activity.id } })} style={styles.registerButton}><Text style={styles.registerText}>Registrar actividad con GPS</Text></Pressable> : null}
    <View style={styles.footer}><Pressable accessibilityRole="button" accessibilityLabel={label + ': ' + activity.title} accessibilityState={{ disabled: unavailable, busy }} onPress={onToggle} disabled={unavailable}
      style={[styles.joinButton, joined && styles.cancelButton, unavailable && styles.disabledButton]}>
      {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={[styles.joinText, joined && styles.cancelText]}>{label}</Text>}</Pressable></View>
  </View>;
}

const styles = StyleSheet.create({
  filter: { minHeight: 44, paddingHorizontal: 15, justifyContent: 'center', borderRadius: 12, backgroundColor: '#191919', borderWidth: 1, borderColor: '#38312A' },
  filterSelected: { backgroundColor: '#332112', borderColor: '#FF7900' },
  weekCard: { backgroundColor: '#18130F', borderColor: '#714319', borderWidth: 1, borderRadius: 18, gap: 14, padding: 16 },
  weekTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  eyebrow: { color: '#FF9A45', fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
  weekTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', marginTop: 5 },
  countBadge: { alignItems: 'center', backgroundColor: '#2A2019', borderColor: '#8A5425', borderRadius: 12, borderWidth: 1, minWidth: 64, padding: 9 },
  count: { color: '#FFB35F', fontSize: 22, fontWeight: '900' }, countLabel: { color: '#D9B28A', fontSize: 10 },
  nextLine: { flexDirection: 'row', gap: 7, alignItems: 'center' }, nextText: { color: '#E7D6C4', fontSize: 12, lineHeight: 18, flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 }, smallDot: { width: 6, height: 6, borderRadius: 3 },
  weekNavigation: { flexDirection: 'row', justifyContent: 'space-between', gap: 4, marginVertical: -10 },
  weekButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 3 },
  currentWeek: { color: '#BDBDBD', fontSize: 12, fontWeight: '700' }, link: { color: '#FFB35F', fontSize: 12, fontWeight: '800' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 }, legendText: { color: '#BFBFBF', fontSize: 11, fontWeight: '700' },
  pastToggle: { backgroundColor: '#131313', borderColor: '#343434', borderRadius: 14, borderWidth: 1, padding: 14, gap: 4 },
  pastText: { color: '#AFAFAF', fontSize: 12, lineHeight: 18 },
  dayRow: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
  dateColumn: { width: 54, borderRadius: 15, borderWidth: 1, borderColor: '#303030', backgroundColor: '#161616', paddingVertical: 14, alignItems: 'center' },
  dateToday: { backgroundColor: '#24180F', borderColor: '#FF7900' },
  dayName: { color: '#BDBDBD', fontSize: 10, fontWeight: '900' }, dayNumber: { color: '#FFFFFF', fontSize: 26, fontWeight: '900', marginVertical: 3 },
  dayMonth: { color: '#FF9A45', fontSize: 10, fontWeight: '900' }, dayContent: { flex: 1, minWidth: 0, gap: 10 },
  activity: { backgroundColor: '#151515', borderColor: '#303030', borderWidth: 1, borderRadius: 16, padding: 13, gap: 8 },
  joinedActivity: { backgroundColor: '#10170D', borderColor: '#5A873D' }, activityTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  typePill: { borderRadius: 10, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 7, gap: 5 },
  typeText: { fontSize: 10, fontWeight: '800' }, time: { color: '#F0F0F0', fontSize: 13, fontWeight: '800' },
  groupLine: { flexDirection: 'row', alignItems: 'center', gap: 7 }, groupName: { color: '#FFB35F', fontSize: 11, fontWeight: '700', flex: 1 },
  activityTitle: { color: '#FFFFFF', fontSize: 16, lineHeight: 22, fontWeight: '800' },
  place: { color: '#C9C9C9', fontSize: 12, lineHeight: 18 }, metadata: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metaPill: { color: '#DDDDDD', fontSize: 10, fontWeight: '700', backgroundColor: '#262626', borderRadius: 7, padding: 6, overflow: 'hidden' },
  note: { color: '#FFB35F', fontSize: 12, lineHeight: 18 }, adminCount: { color: '#ADADAD', fontSize: 11, lineHeight: 17 },
  confirmed: { color: '#9ADE72', fontSize: 12, fontWeight: '700' },
  footer: { alignItems: 'flex-end', marginTop: 3 }, joinButton: { backgroundColor: '#FF7900', borderRadius: 10, minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 8, maxWidth: '100%' },
  joinText: { color: '#141414', fontSize: 12, fontWeight: '800', textAlign: 'center' },
  cancelButton: { backgroundColor: '#24341E', borderColor: '#547C3C', borderWidth: 1 }, cancelText: { color: '#C8EDB3' },
  disabledButton: { opacity: 0.5 }, registerButton: { minHeight: 44, justifyContent: 'center', backgroundColor: '#FF7900', borderRadius: 10, padding: 10 },
  registerText: { color: '#17110C', fontSize: 12, fontWeight: '800', textAlign: 'center' },
  emptyDay: { backgroundColor: '#111111', borderWidth: 1, borderStyle: 'dashed', borderColor: '#282828', borderRadius: 16, padding: 14, gap: 5, minHeight: 105, justifyContent: 'center' },
  emptyTitle: { color: '#CACACA', fontSize: 13, fontWeight: '700' },
  safety: { borderLeftWidth: 4, borderLeftColor: '#FF7900', borderRadius: 12, backgroundColor: '#21180F', padding: 14, gap: 6 },
});
