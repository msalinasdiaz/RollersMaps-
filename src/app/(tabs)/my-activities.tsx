import { darkMapStyleUrl } from '@/lib/map-style';
import { Camera, GeoJSONSource, Layer, Map, ViewAnnotation } from '@maplibre/maplibre-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Switch,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { captureRef, releaseCapture } from 'react-native-view-shot';

import { TrackingMap } from '@/components/tracking-map';
import { InlineSkateIcon } from '@/components/inline-skate-icon';
import { formatMaximumSpeed } from '@/lib/maximum-speed';
import { formatTrackingTime } from '@/lib/tracking-metrics';
import { hasRouteGeometry, routeBounds, routeGeometry, simplifyRouteForDisplay, trimRouteForSharing } from '@/lib/route-geometry';
import { shareCapturedImage } from '@/lib/activity-sharing';
import { Button, Notice, ui } from '@/components/community-ui';
import { activityTypeLabels, type AppActivity } from '@/data/activities';
import { useDemoSession } from '@/contexts/demo-session';
import { useActivities } from '@/hooks/use-activities';
import { useUserActivities, type UserActivity, type UserActivitySummary } from '@/hooks/use-user-activities';

const transparentLogo = require('@/assets/images/rollersmaps-adaptive-foreground.png');

export default function MyActivitiesScreen() {
  const { user } = useDemoSession();
  return <MyActivitiesContent key={user?.id ?? 'guest'} />;
}

function MyActivitiesContent() {
  const { isJoined, isSignedIn } = useDemoSession();
  const { activities: groupActivities, isLoading: groupLoading, error: groupError, refresh: refreshGroups } = useActivities(isSignedIn);
  const { activities: recordedActivities, error: recordedError, isLoading: recordedLoading,
    isLoadingMore, hasMore, loadMore, loadDetail, refresh, renameActivity, deleteActivity, legacyCount, recoverLegacy, sync } = useUserActivities(true);
  const [section, setSection] = useState<'group' | 'gps'>('gps');
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [editingActivity, setEditingActivity] = useState<UserActivitySummary | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const renaming = useRef(false);
  const [shareActivity, setShareActivity] = useState<UserActivity | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [isLogoReady, setIsLogoReady] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [hideShareEndpoints, setHideShareEndpoints] = useState(true);
  const [shareAttempt, setShareAttempt] = useState(0);
  const [isSharing, setIsSharing] = useState(false);
  const sharing = useRef(false);
  const shareCardRef = useRef<View>(null);
  const [detailActivity, setDetailActivity] = useState<UserActivity | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const detailRequest = useRef(0);
  const { record, saved } = useLocalSearchParams<{ record?: string; saved?: string }>();
  const openedRecord = useRef<string | null>(null);
  const shareRoute = useMemo(() => shareActivity ? hideShareEndpoints ? trimRouteForSharing(shareActivity.route, 200) : shareActivity.route : [], [shareActivity, hideShareEndpoints]);
  const registrations = useMemo(() => groupActivities.filter(activity => isJoined(activity.id))
    .sort((a, b) => a.date.getTime() - b.date.getTime()), [groupActivities, isJoined]);

  const openDetail = useCallback(async (activity: UserActivitySummary) => {
    const sequence = ++detailRequest.current;
    setDetailActivity({ ...activity, route: [] }); setDetailLoading(true); setDetailError(null);
    try {
      const detail = await loadDetail(activity);
      if (sequence !== detailRequest.current) return;
      if (detail) setDetailActivity(detail);
      else setDetailError('Este recorrido no está disponible. Puedes actualizar el historial.');
    } catch { if (sequence === detailRequest.current) setDetailError('No pudimos cargar el trazado. Revisa tu conexión y reintenta.'); }
    finally { if (sequence === detailRequest.current) setDetailLoading(false); }
  }, [loadDetail]);
  const closeDetail = useCallback(() => { ++detailRequest.current; setDetailActivity(null); }, []);
  useEffect(() => {
    if (saved || !record || openedRecord.current === record) return;
    const activity = recordedActivities.find(item => item.localId === record);
    if (!activity) return;
    const timer = setTimeout(() => { openedRecord.current = record; void openDetail(activity); }, 0);
    return () => clearTimeout(timer);
  }, [record, saved, recordedActivities, openDetail]);
  useEffect(() => {
    const requests = detailRequest;
    return () => { ++requests.current; };
  }, []);
  useEffect(() => {
    if (!shareActivity || isMapReady && isLogoReady || !hasRouteGeometry(shareRoute)) return;
    const timer = setTimeout(() => setShareError('El mapa o el logo no terminaron de cargar. Reintenta con conexión o vuelve al historial.'), 20000);
    return () => clearTimeout(timer);
  }, [shareActivity, shareAttempt, shareRoute, isMapReady, isLogoReady]);

  const confirmDelete = (activity: UserActivitySummary) => {
    Alert.alert('¿Eliminar recorrido?', 'Se eliminará «' + activity.title + '» de este teléfono y de tu cuenta. No podrás recuperarlo.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        try { await deleteActivity(activity); closeDetail(); }
        catch { Alert.alert('No se completó la eliminación', 'Comprueba la conexión y vuelve a intentarlo.'); }
      } },
    ]);
  };
  const openRename = useCallback((activity: UserActivitySummary) => {
    setEditingActivity(activity); setDraftTitle(activity.title); setRenameError(null);
  }, []);
  const saveRename = async () => {
    if (!editingActivity || renaming.current) return;
    renaming.current = true; setIsRenaming(true);
    try {
      const error = await renameActivity(editingActivity.id, draftTitle);
      if (error) setRenameError(error); else setEditingActivity(null);
    } finally { renaming.current = false; setIsRenaming(false); }
  };
  const resetShareMap = () => {
    setIsMapReady(false); setIsLogoReady(false); setShareError(null); setShareAttempt(n => n + 1);
  };
  const openShare = useCallback(async (activity: UserActivitySummary) => {
    const sequence = ++detailRequest.current;
    setDetailActivity({ ...activity, route: [] }); setDetailLoading(true); setDetailError(null);
    try {
      const detail = await loadDetail(activity);
      if (sequence !== detailRequest.current) return;
      if (!detail || !hasRouteGeometry(detail.route)) {
        setDetailActivity(null);
        Alert.alert('Falta el trazado', 'Esta actividad no guardó suficientes puntos GPS para crear el mapa.'); return;
      }
      setDetailActivity(null);
      setIsMapReady(false); setIsLogoReady(false); setShareError(null); setHideShareEndpoints(true);
      setShareAttempt(n => n + 1); setShareActivity(detail);
    } catch { if (sequence === detailRequest.current) setDetailError('No pudimos cargar el trazado. Revisa tu conexión y reintenta.'); }
    finally { if (sequence === detailRequest.current) setDetailLoading(false); }
  }, [loadDetail]);
  const shareImage = async () => {
    if (!shareActivity || !shareCardRef.current || !isMapReady || !isLogoReady || sharing.current || !hasRouteGeometry(shareRoute)) return;
    sharing.current = true; setIsSharing(true);
    try {
      const shared = await shareCapturedImage({
        available: Sharing.isAvailableAsync,
        capture: () => captureRef(shareCardRef, { format: 'png', height: 1920, quality: 1, result: 'tmpfile', width: 1080 }),
        share: imageUri => Sharing.shareAsync(imageUri, { dialogTitle: 'Compartir mi actividad de RollersMaps', mimeType: 'image/png', UTI: 'public.png' }),
        release: releaseCapture,
      });
      if (!shared) Alert.alert('Compartir no está disponible', 'Este dispositivo no tiene una aplicación compatible para compartir la imagen.');
    } catch { Alert.alert('No pudimos compartir', 'Inténtalo nuevamente. Tu recorrido sigue guardado.'); }
    finally { sharing.current = false; setIsSharing(false); }
  };
  return <View style={styles.screen}>
    <StatusBar style="light" />
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <FlatList
        data={section === 'gps' ? recordedActivities : []}
        keyExtractor={item => item.id}
        renderItem={({ item, index }) => <RecordedCard activity={item} isLatest={index === 0} onDelete={confirmDelete} onView={openDetail} onRename={openRename} onShare={openShare} />}
        initialNumToRender={6} maxToRenderPerBatch={6} windowSize={7}
        contentContainerStyle={styles.content} ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        showsVerticalScrollIndicator={false}
        onEndReached={() => { if (section === 'gps' && hasMore && !recordedError && !recordedLoading && !isLoadingMore) void loadMore(); }}
        onEndReachedThreshold={0.3}
        ListHeaderComponent={<View style={{ gap: 18, paddingBottom: 18 }}>
          <View style={styles.header}>
            <Pressable accessibilityLabel="Volver al inicio" accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}><Text style={styles.backButtonText}>‹</Text></Pressable>
            <View style={styles.headerBrand}><Image source={transparentLogo} resizeMode="contain" style={styles.headerLogo} /><Text style={styles.headerBrandText}>RollersMaps</Text></View><View style={styles.headerSpacer} />
          </View>
          {saved ? <Notice title="Actividad guardada" text="Tu recorrido ya está guardado en este teléfono. Compartirlo es opcional y puedes hacerlo cuando quieras." /> : null}
          <View><Text style={styles.title}>Mis rutas</Text><Text style={styles.subtitle}>Tus recorridos personales y las actividades en las que participas.</Text></View>
          <Button secondary onPress={() => router.push('/mapped-routes')}>Mapear y guardar rutas</Button>
          <View style={styles.segmentedControl}>
            <Pressable accessibilityRole="tab" accessibilityState={{ selected: section === 'group' }} onPress={() => setSection('group')} style={[styles.segment, section === 'group' && styles.segmentActive]}><Text style={[styles.segmentText, section === 'group' && styles.segmentTextActive]}>Inscripciones · {registrations.length}</Text></Pressable>
            <Pressable accessibilityRole="tab" accessibilityState={{ selected: section === 'gps' }} onPress={() => setSection('gps')} style={[styles.segment, section === 'gps' && styles.segmentActive]}><Text style={[styles.segmentText, section === 'gps' && styles.segmentTextActive]}>Registros GPS · {recordedActivities.length}{hasMore ? '+' : ''}</Text></Pressable>
          </View>
          {section === 'gps' && legacyCount > 0 ? <Notice title="Recorridos anteriores en este teléfono" text={'Encontramos ' + legacyCount + ' recorridos guardados sin cuenta. Puedes recuperarlos si son tuyos.'} action="Recuperar mis recorridos" onAction={() => Alert.alert('¿Estos recorridos son tuyos?', 'Se vincularán a tu cuenta y dejarán de estar disponibles para otras cuentas de este teléfono.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Son mis rutas', onPress: () => { recoverLegacy(); setSyncMessage('Tus recorridos anteriores ya están vinculados a tu cuenta en este teléfono. Puedes respaldarlos cuando tengas conexión.'); } }])} /> : null}
          {section === 'gps' && recordedError ? <Notice title="Historial parcialmente disponible" text={recordedError} action="Reintentar" onAction={() => void refresh()} /> : null}
          {section === 'group' ? !isSignedIn ? <Notice title="Tus actividades de grupo" text="Ingresa para ver tus inscripciones." action="Ingresar" onAction={() => router.push('/auth')} /> : groupError ? <Notice title="No pudimos cargar tus inscripciones" action="Reintentar" onAction={() => void refreshGroups()} /> : <RegistrationList activities={registrations} isLoading={groupLoading} /> : null}
        </View>}
        ListEmptyComponent={section !== 'gps' ? null : recordedLoading ? <LoadingState text="Cargando tus registros GPS…" /> : <EmptyState title={recordedError ? 'No pudimos cargar tus recorridos' : 'Aún no tienes recorridos'} text={recordedError ?? 'Toca Abrir mapa en Inicio. Al terminar, tu recorrido quedará guardado aquí.'} />}
        ListFooterComponent={<View style={{ gap: 18, paddingTop: 18 }}>
          {section === 'gps' && hasMore ? <Button secondary busy={isLoadingMore} onPress={() => { void loadMore(); }}>Cargar más recorridos</Button> : null}
          {section === 'gps' ? <View style={{ gap: 12 }}><Text style={ui.muted}>Los recorridos pendientes permanecen en este teléfono hasta que los respaldes.</Text><Button secondary busy={syncing} onPress={() => {
            if (!isSignedIn) { router.push('/auth'); return; }
            if (syncing) return; setSyncing(true);
            void sync().then(error => setSyncMessage(error ?? 'Tus recorridos están respaldados en tu cuenta.')).finally(() => setSyncing(false));
          }}>Respaldar mis rutas</Button>{syncMessage ? <Text accessibilityLiveRegion="polite" style={ui.muted}>{syncMessage}</Text> : null}</View> : null}
          <Text style={styles.copyright}>© 2026 Manuel Salinas · Todos los derechos reservados</Text>
        </View>}
      />
    </SafeAreaView>
    <Modal animationType="slide" visible={Boolean(detailActivity || editingActivity || shareActivity)} onRequestClose={() => {
      if (sharing.current || renaming.current) return;
      ++detailRequest.current; setShareActivity(null); setEditingActivity(null); setDetailActivity(null);
    }}>
    {!shareActivity && !editingActivity && detailActivity ? <RecordedDetail onDelete={() => confirmDelete(detailActivity)} activity={detailActivity} isLoading={detailLoading} error={detailError} onRetry={() => { void openDetail(detailActivity); }} onClose={closeDetail} onShare={() => { void openShare(detailActivity); }} onRename={() => { closeDetail(); openRename(detailActivity); }} /> : null}
    {editingActivity ? <RenameModal activity={editingActivity} error={renameError} isSaving={isRenaming} onCancel={() => { if (!renaming.current) setEditingActivity(null); }} onChangeTitle={setDraftTitle} onSave={() => { void saveRename(); }} title={draftTitle} /> : null}
    {shareActivity ? <ShareModal activity={shareActivity ? { ...shareActivity, route: shareRoute } : null} cardRef={shareCardRef}
      isLogoReady={isLogoReady} isMapReady={isMapReady} isSharing={isSharing} error={shareError} attempt={shareAttempt}
      hideEndpoints={hideShareEndpoints} onPrivacyChange={value => { setHideShareEndpoints(value); resetShareMap(); }} onRetry={resetShareMap}
      onClose={() => { if (!sharing.current) { ++detailRequest.current; setShareActivity(null); } }}
      onLogoReady={() => setIsLogoReady(true)} onMapReady={() => { setIsMapReady(true); setShareError(null); }}
      onMapError={() => setShareError('El mapa no está disponible. Reintenta con conexión o vuelve al historial.')}
      onShare={() => { void shareImage(); }} /> : null}
    </Modal>
  </View>;
}

function RegistrationList({ activities, isLoading }: { activities: AppActivity[]; isLoading: boolean }) {
  if (isLoading) {
    return <LoadingState text="Cargando tus inscripciones…" />;
  }
  if (!activities.length) {
    return <EmptyState title="Aún no tienes inscripciones" text="Cuando te anotes a una ruta o clase, aparecerá acá con sus datos principales." />;
  }

  return (
    <View style={styles.list}>
      {activities.map((activity) => {
        const date = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', weekday: 'short' }).format(activity.date).replace('.', '');
        return (
          <View key={activity.id} style={styles.registrationCard}>
            <View style={styles.cardTopRow}>
              <Text style={styles.eyebrow}>{activityTypeLabels[activity.type].toUpperCase()}</Text>
              <View style={styles.confirmedPill}><Text style={styles.confirmedText}>INSCRITO</Text></View>
            </View>
            <Text style={styles.cardTitle}>{activity.title}</Text>
            <Text style={styles.cardMeta}>{date} · {activity.time}</Text>
            <Text style={styles.cardMeta}>Punto de encuentro: {activity.meetingPoint}</Text>
            <Text style={styles.registrationDetail}>{activity.level ? `${activity.level}${activity.difficulty ? ` · ${activity.difficulty}` : ''}` : 'Casco obligatorio'}</Text>
          </View>
        );
      })}
    </View>
  );
}

const RecordedCard = memo(function RecordedCard({ activity, onDelete, isLatest, onRename, onShare, onView }: {
  activity: UserActivitySummary; onDelete: (activity: UserActivitySummary) => void; isLatest: boolean; onRename: (activity: UserActivitySummary) => void;
  onShare: (activity: UserActivitySummary) => void; onView: (activity: UserActivitySummary) => void;
}) {
  const date = new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' }).format(activity.startedAt);
  const canShare = activity.hasRoute !== false;
  return <View style={[styles.recordedCard, isLatest && styles.recordedCardLatest]}>
    <View style={styles.cardTopRow}><Text style={styles.eyebrow}>{isLatest ? 'ÚLTIMO REGISTRO' : 'REGISTRO GPS'}</Text><Text style={styles.routeState}>{activity.hasRoute === null ? 'Abrir para ver trazado' : activity.hasRoute ? 'Mapa disponible' : 'Sin trazado'}</Text></View>
    <Text style={styles.cardTitle}>{activity.title}</Text><Text style={styles.cardMeta}>{date}</Text>
    <Text style={styles.cardMeta}>{activity.cloudId ? 'Respaldado en tu cuenta' : 'Guardado en este teléfono'}</Text>
    <View style={styles.metrics}><Metric label="Distancia" value={`${activity.distanceKm.toFixed(2)} km`} /><Metric label="Tiempo" value={formatTrackingTime(activity.durationSeconds)} /><Metric label="Vel. media" value={`${activity.averageSpeedKmh.toFixed(1)} km/h`} /></View>
    <Button secondary onPress={() => onView(activity)}>Ver recorrido</Button>
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" onPress={() => onRename(activity)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Renombrar</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canShare }} disabled={!canShare} onPress={() => onShare(activity)} style={[styles.shareButton, !canShare && styles.buttonDisabled]}><Text style={styles.shareButtonText}>Compartir</Text></Pressable>
    </View>
    <Button secondary onPress={() => onDelete(activity)}>Eliminar recorrido</Button>
  </View>;
});

function RecordedDetail({activity,isLoading,error,onRetry,onClose,onShare,onRename,onDelete}:{onDelete:()=>void;activity:UserActivity;isLoading:boolean;error:string|null;onRetry:()=>void;onClose:()=>void;onShare:()=>void;onRename:()=>void}){
  const [expanded,setExpanded]=useState(false);
  return <SafeAreaView style={{flex:1,backgroundColor:'#101010'}}>
      <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:18,minHeight:56}}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar recorrido" onPress={onClose} style={{padding:10,minHeight:48,minWidth:48,justifyContent:'center'}}><Text style={{color:'#FF9A45',fontSize:17}}>‹ Volver</Text></Pressable>
        <Text style={{color:'#FFFFFF',fontSize:16,fontWeight:'700'}}>Tu recorrido</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={expanded?'Mostrar resumen del recorrido':'Ampliar mapa del recorrido'} accessibilityState={{expanded}} onPress={()=>setExpanded(!expanded)} style={{padding:10,minHeight:48,minWidth:48,justifyContent:'center'}}><Text style={{color:'#FF9A45',fontSize:14}}>{expanded?'Resumen':'Ampliar'}</Text></Pressable>
      </View>
      <View style={expanded?{flex:1}:{height:300}}>
        {isLoading?<LoadingState text="Cargando el trazado…"/>:error?<Notice title="No pudimos cargar el trazado" text={error} action="Reintentar" onAction={onRetry}/>:activity.route.length?<TrackingMap route={activity.route} location={null} overview bottomInset={22}/>:<View style={{flex:1,alignItems:'center',justifyContent:'center'}}><Text style={ui.muted}>Este recorrido no tiene trazado GPS.</Text></View>}
      </View>
      {!expanded?<ScrollView contentContainerStyle={{padding:22,gap:18}}>
        <View style={{flexDirection:'row',alignItems:'center',gap:10}}><InlineSkateIcon size={28}/><Text style={{color:'#FF9A45',fontSize:14}}>Patinaje en línea</Text></View>
        <Text style={{color:'#FFFFFF',fontSize:26,fontWeight:'800'}}>{activity.title}</Text>
        <Text style={{color:'#A9ABB5',fontSize:14}}>{activity.startedAt.toLocaleString('es-CL')} · {activity.cloudId?'Respaldado en tu cuenta':'Guardado en este teléfono'}</Text>
        <View style={styles.metrics}>
          <Metric label="Distancia" value={activity.distanceKm.toFixed(2).replace('.',',')+' km'}/>
          <Metric label="Tiempo activo" value={formatTrackingTime(activity.durationSeconds)}/>
          <Metric label="Velocidad media" value={activity.averageSpeedKmh.toFixed(1).replace('.',',')+' km/h'}/>
        </View>
        <Text style={ui.heading}>3 velocidades máximas</Text>
        <View style={styles.metrics}>
          {[0, 1, 2].map(i => <Metric key={i} label={`${i + 1}ª máxima`} value={formatMaximumSpeed(activity.topSpeedsKmh?.[i]) + ' km/h'} />)}
        </View>
        <Button disabled={isLoading || !hasRouteGeometry(activity.route)} onPress={onShare}>Compartir recorrido</Button>
        <Button secondary onPress={onRename}>Renombrar</Button>
        <Button secondary onPress={onDelete}>Eliminar recorrido</Button>
      </ScrollView>:null}
    </SafeAreaView>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function LoadingState({ text }: { text: string }) {
  return <View style={styles.stateCard}><ActivityIndicator color="#FF7900" /><Text style={styles.stateText}>{text}</Text></View>;
}

function EmptyState({ text, title }: { text: string; title: string }) {
  return <View style={styles.stateCard}><Text style={styles.stateTitle}>{title}</Text><Text style={styles.stateText}>{text}</Text></View>;
}

function RenameModal({
  error,
  isSaving,
  onCancel,
  onChangeTitle,
  onSave,
  title,
}: {
  activity: UserActivitySummary | null;
  error: string | null;
  isSaving: boolean;
  onCancel: () => void;
  onChangeTitle: (title: string) => void;
  onSave: () => void;
  title: string;
}) {
  return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBackdrop}>
        <View style={styles.renameDialog}>
          <Text style={styles.modalTitle}>Renombrar actividad</Text>
          <Text style={styles.modalText}>Ponle un nombre que te ayude a reconocer este recorrido.</Text>
          <TextInput
            accessibilityLabel="Nuevo nombre de la actividad"
            autoFocus
            editable={!isSaving}
            maxLength={60}
            onChangeText={onChangeTitle}
            onSubmitEditing={onSave}
            placeholder="Ej.: Vuelta por el Parque"
            placeholderTextColor="#A9A9A9"
            returnKeyType="done"
            selectTextOnFocus
            style={styles.renameInput}
            value={title}
          />
          <Text style={styles.characterCount}>{title.trim().length}/60</Text>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <View style={styles.modalActions}>
            <Pressable accessibilityRole="button" accessibilityState={{disabled:isSaving}} disabled={isSaving} onPress={onCancel} style={styles.modalCancel}><Text style={styles.modalCancelText}>Cancelar</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{disabled:isSaving,busy:isSaving}} disabled={isSaving} onPress={onSave} style={[styles.modalSave, isSaving && styles.buttonDisabled]}>
              {isSaving ? <ActivityIndicator color="#111111" size="small" /> : <Text style={styles.modalSaveText}>Guardar nombre</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
  );
}

function ShareModal({ activity, cardRef, isLogoReady, isMapReady, isSharing, error, attempt, hideEndpoints, onPrivacyChange, onRetry, onClose, onLogoReady, onMapReady, onMapError, onShare }: {
  activity: UserActivity | null; cardRef: React.RefObject<View | null>; isLogoReady: boolean; isMapReady: boolean; isSharing: boolean;
  error: string | null; attempt: number; hideEndpoints: boolean; onPrivacyChange: (value: boolean) => void; onRetry: () => void;
  onClose: () => void; onLogoReady: () => void; onMapReady: () => void; onMapError: () => void; onShare: () => void;
}) {
  const hasRoute = Boolean(activity && hasRouteGeometry(activity.route));
  const isCardReady = hasRoute && isMapReady && isLogoReady && !error;
  return <View style={styles.shareScreen}><StatusBar style="light" />
      <SafeAreaView style={styles.shareSafeArea} edges={['top', 'bottom']}>
        <View style={styles.shareHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar imagen para compartir" disabled={isSharing} onPress={onClose} style={styles.shareClose}><Text style={styles.shareCloseText}>×</Text></Pressable>
          <Text style={styles.shareHeaderTitle}>Compartir recorrido</Text><View style={styles.shareClose} />
        </View>
        <ScrollView contentContainerStyle={styles.shareContent} showsVerticalScrollIndicator={false}>
          <View style={{ width: '100%', maxWidth: 380, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><Text style={[styles.shareHelp, { flex: 1, textAlign: 'left' }]}>Ocultar 200 m del inicio y del final</Text><Switch accessibilityLabel="Ocultar extremos sensibles del recorrido" value={hideEndpoints} disabled={isSharing} onValueChange={onPrivacyChange} trackColor={{ false: '#565656', true: '#B65A14' }} thumbColor="#FFFFFF" /></View>
            <Text style={styles.shareHelp}>La imagen incluye título, fecha y trazado visible. Revisa la vista previa antes de enviarla.</Text>
          </View>
          {activity && hasRoute ? <ActivityShareCard key={`${activity.id}:${attempt}`} activity={activity} cardRef={cardRef} onLogoReady={onLogoReady} onMapReady={onMapReady} onMapError={onMapError} /> : activity ? <EmptyState title="Recorrido corto para ocultar los extremos" text="No queda un trazado suficiente después del recorte. Puedes volver o desactivar la protección para revisar la imagen completa." /> : null}
        </ScrollView>
        <View style={styles.shareFooter}>
          <Text accessibilityLiveRegion="polite" style={styles.shareHelp}>{error ?? (isCardReady ? 'La imagen está lista para compartir.' : hasRoute ? 'Preparando el mapa y el logo…' : 'Revisa la protección de extremos.')}</Text>
          {error ? <Button secondary disabled={isSharing} onPress={onRetry}>Reintentar mapa</Button> : null}
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: !isCardReady || isSharing }} disabled={!isCardReady || isSharing} onPress={onShare} style={[styles.shareAction, (!isCardReady || isSharing) && styles.buttonDisabled]}>{isSharing ? <ActivityIndicator color="#111111" /> : <Text style={styles.shareActionText}>Compartir imagen</Text>}</Pressable>
        </View>
      </SafeAreaView>
    </View>;
}

// Keep share images on OpenFreeMap: Google SDK snapshots are for use inside
// the app, while this card is exported to other applications.
function ActivityShareCard({
  activity,
  cardRef,
  onLogoReady,
  onMapReady,
  onMapError,
}: {
  activity: UserActivity;
  cardRef: React.RefObject<View | null>;
  onLogoReady: () => void;
  onMapReady: () => void;
  onMapError: () => void;
}) {
  const displayRoute = useMemo(() => simplifyRouteForDisplay(activity.route), [activity.route]);
  const bounds = useMemo(() => routeBounds(displayRoute), [displayRoute]);
  const routeFeature = useMemo(() => ({
    type: 'Feature' as const,
    properties: {},
    geometry: routeGeometry(displayRoute)!,
  }), [displayRoute]);
  const start = activity.route[0];
  const finish = activity.route.at(-1);
  const duration = formatShareDuration(activity.durationSeconds);
  const date = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }).format(activity.startedAt);

  return (
    <View collapsable={false} ref={cardRef} style={styles.shareCard}>
      <Map
        androidView="texture"
        attribution={false}
        compass={false}
        logo={false}
        mapStyle={darkMapStyleUrl}
        onDidFinishRenderingMapFully={onMapReady}
        onDidFailLoadingMap={onMapError}
        style={StyleSheet.absoluteFill}>
        <Camera bounds={bounds} padding={{ bottom: 330, left: 80, right: 80, top: 170 }} />
        <GeoJSONSource data={routeFeature} id="share-route">
          <Layer
            id="share-route-halo"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': '#07111F', 'line-opacity': 0.6, 'line-width': 10 }}
            type="line"
          />
          <Layer
            id="share-route-line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': '#FF7900', 'line-width': 6 }}
            type="line"
          />
        </GeoJSONSource>
        {start ? <ViewAnnotation id="share-start" lngLat={[start.longitude, start.latitude]}><MapPin label="INICIO" tone="start" /></ViewAnnotation> : null}
        {finish ? <ViewAnnotation id="share-finish" lngLat={[finish.longitude, finish.latitude]}><MapPin label="FIN" tone="finish" /></ViewAnnotation> : null}
      </Map>
      <Image
        accessibilityLabel="RollersMaps"
        fadeDuration={0}
        onLoad={onLogoReady}
        onError={onMapError}
        source={transparentLogo}
        resizeMode="contain"
        style={styles.shareLogo}
      />
      <View pointerEvents="none" style={styles.shareSummary}>
        <Text style={styles.shareEyebrow}>MI ACTIVIDAD · {date.toUpperCase()}</Text>
        <Text numberOfLines={2} style={styles.shareTitle}>{activity.title}</Text>
        <View style={styles.shareMetrics}>
          <ShareMetric label="DISTANCIA" value={`${activity.distanceKm.toFixed(2)} km`} />
          <ShareMetric label="DURACIÓN" value={duration} />
          <ShareMetric label="MEDIA" value={`${activity.averageSpeedKmh.toFixed(1)} km/h`} />
          <ShareMetric label="MÁXIMA" value={`${formatMaximumSpeed(activity.maximumSpeedKmh)} km/h`} />
        </View>
        <Text style={styles.shareCopyright}>© 2026 Manuel Salinas</Text>
        <Text style={styles.shareAttribution}>© OpenStreetMap contributors · OpenFreeMap</Text>
      </View>
    </View>
  );
}

function ShareMetric({ label, value }: { label: string; value: string }) {
  return <View style={styles.shareMetric}><Text style={styles.shareMetricLabel}>{label}</Text><Text style={styles.shareMetricValue}>{value}</Text></View>;
}

function formatShareDuration(durationSeconds: number) { return formatTrackingTime(durationSeconds); }

function MapPin({ label, tone }: { label: string; tone: 'start' | 'finish' }) {
  return <View style={[styles.mapPin, tone === 'start' ? styles.mapPinStart : styles.mapPinFinish]}><Text style={styles.mapPinText}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#070707', flex: 1 },
  safeArea: { flex: 1 },
  content: { gap: 18, padding: 20, paddingBottom: 72 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  backButton: { alignItems: 'center', backgroundColor: '#1D1D1D', borderColor: '#393939', borderRadius: 21, borderWidth: 1, height: 48, justifyContent: 'center', width: 48 },
  backButtonText: { color: '#FFFFFF', fontSize: 31, fontWeight: '400', lineHeight: 34, marginTop: -3 },
  headerBrand: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  headerLogo: { height: 60, width: 60 },
  headerBrandText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  headerSpacer: { width: 48 },
  title: { color: '#FFFFFF', fontSize: 30, fontWeight: '900' },
  subtitle: { color: '#BDBDBD', fontSize: 14, lineHeight: 20, marginTop: 5 },
  segmentedControl: { backgroundColor: '#151515', borderColor: '#303030', borderRadius: 14, borderWidth: 1, flexDirection: 'row', padding: 5 },
  segment: { alignItems: 'center', borderRadius: 10, flex: 1, minHeight: 48, justifyContent: 'center', paddingHorizontal: 7 },
  segmentActive: { backgroundColor: '#FF7900' },
  segmentText: { color: '#AFAFAF', fontSize: 13, fontWeight: '900', textAlign: 'center' },
  segmentTextActive: { color: '#111111' },
  list: { gap: 11 },
  registrationCard: { backgroundColor: '#151515', borderColor: '#303030', borderRadius: 16, borderWidth: 1, gap: 7, padding: 15 },
  recordedCard: { backgroundColor: '#151515', borderColor: '#303030', borderRadius: 17, borderWidth: 1, gap: 8, padding: 15 },
  recordedCardLatest: { backgroundColor: '#19130E', borderColor: '#8C4B16' },
  cardTopRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  eyebrow: { color: '#FF9A45', fontSize: 12, fontWeight: '900', letterSpacing: 0.7 },
  confirmedPill: { backgroundColor: '#162510', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 },
  confirmedText: { color: '#8BE75A', fontSize: 11, fontWeight: '900' },
  routeState: { color: '#A9A9A9', fontSize: 12, fontWeight: '700' },
  cardTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '900', lineHeight: 22 },
  cardMeta: { color: '#BDBDBD', fontSize: 14, lineHeight: 20 },
  registrationDetail: { color: '#FFB35F', fontSize: 14, fontWeight: '900', marginTop: 2 },
  metrics: { backgroundColor: '#0E0E0E', borderRadius: 12, flexDirection: 'row', marginTop: 3, paddingVertical: 12 },
  metric: { alignItems: 'center', flex: 1 },
  metricValue: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  metricLabel: { color: '#B5B5B5', fontSize: 11, fontWeight: '800', marginTop: 3 },
  actions: { flexDirection: 'row', gap: 9, marginTop: 3 },
  secondaryButton: { alignItems: 'center', borderColor: '#565656', borderRadius: 11, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 48 },
  secondaryButtonText: { color: '#E7E7E7', fontSize: 14, fontWeight: '900' },
  shareButton: { alignItems: 'center', backgroundColor: '#FF7900', borderRadius: 11, flex: 1.25, justifyContent: 'center', minHeight: 48 },
  shareButtonText: { color: '#111111', fontSize: 14, fontWeight: '900' },
  buttonDisabled: { opacity: 0.5 },
  stateCard: { alignItems: 'center', backgroundColor: '#151515', borderColor: '#303030', borderRadius: 17, borderStyle: 'dashed', borderWidth: 1, gap: 8, padding: 28 },
  stateTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '900', textAlign: 'center' },
  stateText: { color: '#BDBDBD', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  futureCard: { backgroundColor: '#121A23', borderColor: '#30445B', borderRadius: 15, borderWidth: 1, padding: 14 },
  futureTitle: { color: '#A9D0FF', fontSize: 12, fontWeight: '900' },
  futureText: { color: '#BFCADA', fontSize: 10, lineHeight: 15, marginTop: 5 },
  copyright: { color: '#B5B5B5', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.76)', flex: 1, justifyContent: 'center', padding: 22 },
  renameDialog: { backgroundColor: '#171717', borderColor: '#3A3A3A', borderRadius: 20, borderWidth: 1, padding: 18, width: '100%' },
  modalTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  modalText: { color: '#AFAFAF', fontSize: 14, lineHeight: 20, marginTop: 6 },
  renameInput: { backgroundColor: '#0B0B0B', borderColor: '#595959', borderRadius: 12, borderWidth: 1, color: '#FFFFFF', fontSize: 14, marginTop: 15, minHeight: 49, paddingHorizontal: 13 },
  characterCount: { color: '#BDBDBD', fontSize: 12, marginTop: 5, textAlign: 'right' },
  errorText: { color: '#FFB9A8', fontSize: 14, fontWeight: '700', marginTop: 6 },
  modalActions: { flexDirection: 'row', gap: 9, marginTop: 16 },
  modalCancel: { alignItems: 'center', borderColor: '#4A4A4A', borderRadius: 11, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 48 },
  modalCancelText: { color: '#E0E0E0', fontSize: 14, fontWeight: '900' },
  modalSave: { alignItems: 'center', backgroundColor: '#FF7900', borderRadius: 11, flex: 1.35, justifyContent: 'center', minHeight: 48 },
  modalSaveText: { color: '#111111', fontSize: 14, fontWeight: '900' },
  shareScreen: { backgroundColor: '#090909', flex: 1 },
  shareSafeArea: { flex: 1 },
  shareHeader: { alignItems: 'center', borderBottomColor: '#292929', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: 16 },
  shareClose: { alignItems: 'center', height: 48, justifyContent: 'center', width: 48 },
  shareCloseText: { color: '#FFFFFF', fontSize: 32, fontWeight: '300' },
  shareHeaderTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  shareContent: { alignItems: 'center', gap: 14, padding: 18 },
  shareFooter: { alignItems: 'center', backgroundColor: '#090909', borderTopColor: '#292929', borderTopWidth: 1, gap: 10, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 14 },
  shareCard: { aspectRatio: 9 / 16, backgroundColor: '#07111F', maxWidth: 380, overflow: 'hidden', position: 'relative', width: '100%' },
  shareLogo: { height: 54, left: 18, position: 'absolute', top: 20, width: 54 },
  shareSummary: { backgroundColor: 'rgba(4,10,18,0.9)', bottom: 0, left: 0, padding: 21, position: 'absolute', right: 0 },
  shareEyebrow: { color: '#FF9A45', fontSize: 12, fontWeight: '900', letterSpacing: 0.7 },
  shareTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', lineHeight: 28, marginTop: 7 },
  shareMetrics: { flexDirection: 'row', marginTop: 17 },
  shareMetric: { flex: 1 },
  shareMetricLabel: { color: '#AEB6C0', fontSize: 12, fontWeight: '900' },
  shareMetricValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', marginTop: 4 },
  shareCopyright: { color: '#D3DAE4', fontSize: 12, marginTop: 17 },
  shareAttribution: { color: '#D3DAE4', fontSize: 12, marginTop: 3 },
  mapPin: { alignItems: 'center', borderColor: '#FFFFFF', borderRadius: 13, borderWidth: 2, paddingHorizontal: 8, paddingVertical: 5 },
  mapPinStart: { backgroundColor: '#2F9B55' },
  mapPinFinish: { backgroundColor: '#FF5B35' },
  mapPinText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  shareHelp: { color: '#AFAFAF', fontSize: 14, lineHeight: 20, maxWidth: 380, textAlign: 'center' },
  shareAction: { alignItems: 'center', backgroundColor: '#FF7900', borderRadius: 13, justifyContent: 'center', maxWidth: 380, minHeight: 49, paddingHorizontal: 28, width: '100%' },
  shareActionText: { color: '#111111', fontSize: 13, fontWeight: '900' },
  required: { alignItems: 'center', justifyContent: 'center', padding: 28 },
  requiredLogo: { height: 110, width: 110 },
  requiredTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', marginBottom: 20, marginTop: 15, textAlign: 'center' },
});
