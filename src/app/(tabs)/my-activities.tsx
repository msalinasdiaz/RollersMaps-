import { Camera, GeoJSONSource, Layer, Map, ViewAnnotation } from '@maplibre/maplibre-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { captureRef } from 'react-native-view-shot';

import { TrackingMap } from '@/components/tracking-map';
import { InlineSkateIcon } from '@/components/inline-skate-icon';
import { formatTrackingTime } from '@/lib/tracking-metrics';
import { routeGeometry } from '@/lib/route-geometry';
import { Button, Notice, ui } from '@/components/community-ui';
import { activityTypeLabels, type AppActivity } from '@/data/activities';
import { useDemoSession } from '@/contexts/demo-session';
import { useActivities } from '@/hooks/use-activities';
import { useUserActivities, type UserActivity } from '@/hooks/use-user-activities';

const transparentLogo = require('@/assets/images/rollersmaps-adaptive-foreground.png');
const shareLogoAsset = require('@/assets/images/rollersmaps-app-icon.png');
const mapStyleUrl = 'https://tiles.openfreemap.org/styles/liberty';

export default function MyActivitiesScreen() {
  const { isJoined, isSignedIn } = useDemoSession();
  const { activities: groupActivities, isLoading: groupLoading, error: groupError, refresh: refreshGroups } = useActivities(isSignedIn);
  const {
    activities: recordedActivities,
    error: recordedError,
    isLoading: recordedLoading,
    renameActivity,
    legacyCount,
    recoverLegacy,
    sync,
  } = useUserActivities(true);
  const [section, setSection] = useState<'group' | 'gps'>('gps');
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [editingActivity, setEditingActivity] = useState<UserActivity | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [shareActivity, setShareActivity] = useState<UserActivity | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [isLogoReady, setIsLogoReady] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const shareCardRef = useRef<View>(null);
  const [detailActivity,setDetailActivity]=useState<UserActivity|null>(null);
  const {record}=useLocalSearchParams<{record?:string}>();
  const openedRecord=useRef<string|null>(null);
  useEffect(()=>{
    if(!record||openedRecord.current===record)return;
    const activity=recordedActivities.find(item=>item.localId===record);
    if(!activity)return;
    const timer=setTimeout(()=>{openedRecord.current=record;setDetailActivity(activity);},0);
    return()=>clearTimeout(timer);
  },[record,recordedActivities]);

  const registrations = useMemo(
    () => groupActivities
      .filter((activity) => isJoined(activity.id))
      .sort((left, right) => left.date.getTime() - right.date.getTime()),
    [groupActivities, isJoined],
  );


  const openRename = (activity: UserActivity) => {
    setEditingActivity(activity);
    setDraftTitle(activity.title);
    setRenameError(null);
  };

  const saveRename = async () => {
    if (!editingActivity) {
      return;
    }

    setIsRenaming(true);
    const error = await renameActivity(editingActivity.id, draftTitle);
    setIsRenaming(false);
    if (error) {
      setRenameError(error);
      return;
    }
    setEditingActivity(null);
  };

  const openShare = (activity: UserActivity) => {
    if (!routeGeometry(activity.route)) {
      Alert.alert('Falta el trazado', 'Esta actividad no alcanzó a guardar suficientes puntos GPS para crear el mapa.');
      return;
    }
    setIsMapReady(false);
    setIsLogoReady(false);
    setShareActivity(activity);
  };

  const shareImage = async () => {
    if (!shareActivity || !shareCardRef.current || !isMapReady || !isLogoReady) {
      return;
    }

    setIsSharing(true);
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Compartir no está disponible', 'Este dispositivo no tiene una aplicación compatible para compartir la imagen.');
        return;
      }

      const imageUri = await captureRef(shareCardRef, {
        format: 'png',
        height: 1920,
        quality: 1,
        result: 'tmpfile',
        width: 1080,
      });
      await Sharing.shareAsync(imageUri, {
        dialogTitle: 'Compartir mi actividad de RollersMaps',
        mimeType: 'image/png',
        UTI: 'public.png',
      });
    } catch {
      Alert.alert('No pudimos compartir', 'Inténtalo nuevamente cuando el mapa termine de cargar.');
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Pressable accessibilityLabel="Volver al inicio" accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
              <Text style={styles.backButtonText}>‹</Text>
            </Pressable>
            <View style={styles.headerBrand}>
              <Image source={transparentLogo} resizeMode="contain" style={styles.headerLogo} />
              <Text style={styles.headerBrandText}>RollersMaps</Text>
            </View>
            <View style={styles.headerSpacer} />
          </View>

          <View>
            <Text style={styles.title}>Mis rutas</Text>
            <Text style={styles.subtitle}>Tus recorridos personales y las actividades en las que participas.</Text>
          </View>

          <View style={styles.segmentedControl}>
            <Pressable accessibilityRole="tab" accessibilityState={{ selected: section === 'group' }} onPress={() => setSection('group')} style={[styles.segment, section === 'group' && styles.segmentActive]}>
              <Text style={[styles.segmentText, section === 'group' && styles.segmentTextActive]}>Inscripciones · {registrations.length}</Text>
            </Pressable>
            <Pressable accessibilityRole="tab" accessibilityState={{ selected: section === 'gps' }} onPress={() => setSection('gps')} style={[styles.segment, section === 'gps' && styles.segmentActive]}>
              <Text style={[styles.segmentText, section === 'gps' && styles.segmentTextActive]}>Registros GPS · {recordedActivities.length}</Text>
            </Pressable>
          </View>

          {section === 'gps' && legacyCount > 0 ? <Notice
            title="Recorridos anteriores en este teléfono"
            text={'Encontramos ' + legacyCount + ' recorridos guardados sin cuenta. Puedes recuperarlos si son tuyos.'}
            action="Recuperar mis recorridos"
            onAction={() => Alert.alert('¿Estos recorridos son tuyos?', 'Se vincularán a tu cuenta y dejarán de estar disponibles para otras cuentas de este teléfono.', [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Son mis rutas', onPress: () => { recoverLegacy(); setSyncMessage('Tus recorridos anteriores ya están vinculados a tu cuenta en este teléfono. Puedes respaldarlos cuando tengas conexión.'); } },
            ])}
          /> : null}

          {section === 'group' ? (
            !isSignedIn ? <Notice title="Tus actividades de grupo" text="Ingresa para ver tus inscripciones." action="Ingresar" onAction={() => router.push('/auth')} /> : groupError ? <Notice title="No pudimos cargar tus inscripciones" action="Reintentar" onAction={() => void refreshGroups()} /> : <RegistrationList activities={registrations} isLoading={groupLoading} />
          ) : (
            <RecordedList
              activities={recordedActivities}
              error={recordedError}
              isLoading={recordedLoading}
              onView={setDetailActivity}
              onRename={openRename}
              onShare={openShare}
            />
          )}

          {section === 'gps' ? <View style={{ gap: 12 }}><Text style={ui.muted}>Los recorridos pendientes permanecen en este teléfono hasta que los respaldes.</Text><Button secondary busy={syncing} onPress={() => {
            if (!isSignedIn) { router.push('/auth'); return; }
            setSyncing(true);
            void sync().then((error) => setSyncMessage(error ?? 'Tus recorridos están respaldados en tu cuenta.')).finally(() => setSyncing(false));
          }}>Respaldar mis rutas</Button>{syncMessage ? <Text accessibilityLiveRegion="polite" style={ui.muted}>{syncMessage}</Text> : null}</View> : null}
          <Text style={styles.copyright}>© 2026 Manuel Salinas · Todos los derechos reservados</Text>
        </ScrollView>
      </SafeAreaView>

      {detailActivity?<RecordedDetail activity={detailActivity} onClose={()=>setDetailActivity(null)} onShare={()=>{setDetailActivity(null);openShare(detailActivity);}} onRename={()=>{setDetailActivity(null);openRename(detailActivity);}}/>:null}
      <RenameModal
        activity={editingActivity}
        error={renameError}
        isSaving={isRenaming}
        onCancel={() => setEditingActivity(null)}
        onChangeTitle={setDraftTitle}
        onSave={() => { void saveRename(); }}
        title={draftTitle}
      />
      <ShareModal
        activity={shareActivity}
        cardRef={shareCardRef}
        isLogoReady={isLogoReady}
        isMapReady={isMapReady}
        isSharing={isSharing}
        onClose={() => setShareActivity(null)}
        onLogoReady={() => setIsLogoReady(true)}
        onMapReady={() => setIsMapReady(true)}
        onShare={() => { void shareImage(); }}
      />
    </View>
  );
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

function RecordedList({
  activities,
  error,
  isLoading,
  onRename,
  onShare,
  onView,
}: {
  activities: UserActivity[];
  error: string | null;
  isLoading: boolean;
  onView: (activity: UserActivity) => void;
  onRename: (activity: UserActivity) => void;
  onShare: (activity: UserActivity) => void;
}) {
  if (isLoading) {
    return <LoadingState text="Cargando tus registros GPS…" />;
  }
  if (!activities.length) {
    return <EmptyState title={error ? 'No pudimos cargar tus recorridos' : 'Aún no tienes recorridos'} text={error ?? 'Toca Patinar libre en Inicio. Al terminar, tu recorrido quedará guardado aquí.'} />;
  }

  return (
    <View style={styles.list}>
      {activities.map((activity, index) => {
        const date = new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' }).format(activity.startedAt);
        const minutes = Math.max(1, Math.round(activity.durationSeconds / 60));
        const isLatest = index === 0;
        return (
          <View key={activity.id} style={[styles.recordedCard, isLatest && styles.recordedCardLatest]}>
            <View style={styles.cardTopRow}>
              <Text style={styles.eyebrow}>{isLatest ? 'ÚLTIMO REGISTRO' : 'REGISTRO GPS'}</Text>
              <Text style={styles.routeState}>{activity.route.length > 1 ? 'Mapa disponible' : 'Sin trazado'}</Text>
            </View>
            <Text style={styles.cardTitle}>{activity.title}</Text>
            <Text style={styles.cardMeta}>{date}</Text>
            <Text style={styles.cardMeta}>{activity.cloudId ? 'Respaldado en tu cuenta' : 'Guardado en este teléfono'}</Text>
            <View style={styles.metrics}>
              <Metric label="Distancia" value={`${activity.distanceKm.toFixed(2)} km`} />
              <Metric label="Tiempo" value={`${minutes} min`} />
              <Metric label="Vel. media" value={`${activity.averageSpeedKmh.toFixed(1)} km/h`} />
            </View>
            <Button secondary onPress={()=>onView(activity)}>Ver recorrido</Button>
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" onPress={() => onRename(activity)} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Renombrar</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: !routeGeometry(activity.route) }} disabled={!routeGeometry(activity.route)} onPress={() => onShare(activity)} style={[styles.shareButton, !routeGeometry(activity.route) && styles.buttonDisabled]}>
                <Text style={styles.shareButtonText}>Compartir</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function RecordedDetail({activity,onClose,onShare,onRename}:{activity:UserActivity;onClose:()=>void;onShare:()=>void;onRename:()=>void}){
  const [expanded,setExpanded]=useState(false);
  return <Modal animationType="slide" onRequestClose={onClose} visible>
    <SafeAreaView style={{flex:1,backgroundColor:'#101010'}}>
      <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:18,minHeight:56}}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar recorrido" onPress={onClose} style={{padding:10}}><Text style={{color:'#FF9A45',fontSize:17}}>‹ Volver</Text></Pressable>
        <Text style={{color:'#FFFFFF',fontSize:16,fontWeight:'700'}}>Tu recorrido</Text>
        <Pressable accessibilityRole="button" onPress={()=>setExpanded(!expanded)} style={{padding:10}}><Text style={{color:'#FF9A45',fontSize:14}}>{expanded?'Resumen':'Ampliar'}</Text></Pressable>
      </View>
      <View style={expanded?{flex:1}:{height:300}}>
        {activity.route.length?<TrackingMap route={activity.route} location={null} overview bottomInset={22}/>:<View style={{flex:1,alignItems:'center',justifyContent:'center'}}><Text style={ui.muted}>Este recorrido no tiene trazado GPS.</Text></View>}
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
        <Button disabled={!routeGeometry(activity.route)} onPress={onShare}>Compartir recorrido</Button>
        <Button secondary onPress={onRename}>Renombrar</Button>
      </ScrollView>:null}
    </SafeAreaView>
  </Modal>;
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
  activity,
  error,
  isSaving,
  onCancel,
  onChangeTitle,
  onSave,
  title,
}: {
  activity: UserActivity | null;
  error: string | null;
  isSaving: boolean;
  onCancel: () => void;
  onChangeTitle: (title: string) => void;
  onSave: () => void;
  title: string;
}) {
  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={Boolean(activity)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBackdrop}>
        <View style={styles.renameDialog}>
          <Text style={styles.modalTitle}>Renombrar actividad</Text>
          <Text style={styles.modalText}>Ponle un nombre que te ayude a reconocer este recorrido.</Text>
          <TextInput
            accessibilityLabel="Nuevo nombre de la actividad"
            autoFocus
            maxLength={60}
            onChangeText={onChangeTitle}
            onSubmitEditing={onSave}
            placeholder="Ej.: Vuelta por el Parque"
            placeholderTextColor="#777777"
            returnKeyType="done"
            selectTextOnFocus
            style={styles.renameInput}
            value={title}
          />
          <Text style={styles.characterCount}>{title.trim().length}/60</Text>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <View style={styles.modalActions}>
            <Pressable disabled={isSaving} onPress={onCancel} style={styles.modalCancel}><Text style={styles.modalCancelText}>Cancelar</Text></Pressable>
            <Pressable disabled={isSaving} onPress={onSave} style={[styles.modalSave, isSaving && styles.buttonDisabled]}>
              {isSaving ? <ActivityIndicator color="#111111" size="small" /> : <Text style={styles.modalSaveText}>Guardar nombre</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ShareModal({
  activity,
  cardRef,
  isLogoReady,
  isMapReady,
  isSharing,
  onClose,
  onLogoReady,
  onMapReady,
  onShare,
}: {
  activity: UserActivity | null;
  cardRef: React.RefObject<View | null>;
  isLogoReady: boolean;
  isMapReady: boolean;
  isSharing: boolean;
  onClose: () => void;
  onLogoReady: () => void;
  onMapReady: () => void;
  onShare: () => void;
}) {
  const isCardReady = isMapReady && isLogoReady;
  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={Boolean(activity)}>
      <View style={styles.shareScreen}>
        <SafeAreaView style={styles.shareSafeArea}>
          <View style={styles.shareHeader}>
            <Pressable accessibilityLabel="Cerrar vista previa" accessibilityRole="button" onPress={onClose} style={styles.shareClose}><Text style={styles.shareCloseText}>×</Text></Pressable>
            <Text style={styles.shareHeaderTitle}>Compartir actividad</Text>
            <View style={styles.shareClose} />
          </View>
          <ScrollView contentContainerStyle={styles.shareContent} showsVerticalScrollIndicator={false}>
            {activity ? <ActivityShareCard activity={activity} cardRef={cardRef} onLogoReady={onLogoReady} onMapReady={onMapReady} /> : null}
          </ScrollView>
          <View style={styles.shareFooter}>
            <Text style={styles.shareHelp}>{isCardReady ? 'La imagen está lista para compartir.' : 'Preparando el mapa y el logo…'}</Text>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: !isCardReady || isSharing }} disabled={!isCardReady || isSharing} onPress={onShare} style={[styles.shareAction, (!isCardReady || isSharing) && styles.buttonDisabled]}>
              {isSharing ? <ActivityIndicator color="#111111" /> : <Text style={styles.shareActionText}>Compartir imagen</Text>}
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function ActivityShareCard({
  activity,
  cardRef,
  onLogoReady,
  onMapReady,
}: {
  activity: UserActivity;
  cardRef: React.RefObject<View | null>;
  onLogoReady: () => void;
  onMapReady: () => void;
}) {
  const bounds = routeBounds(activity.route);
  const routeFeature = {
    type: 'Feature' as const,
    properties: {},
    geometry: routeGeometry(activity.route)!,
  };
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
        mapStyle={mapStyleUrl}
        onDidFinishRenderingMapFully={onMapReady}
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
      <View pointerEvents="none" style={styles.shareGradientTop} />
      <View pointerEvents="none" style={styles.shareBrand}>
        <View style={styles.shareLogoFrame}>
          <Image fadeDuration={0} onLoadEnd={onLogoReady} source={shareLogoAsset} resizeMode="cover" style={styles.shareLogo} />
        </View>
        <View><Text style={styles.shareBrandName}>RollersMaps</Text><Text style={styles.shareBrandTagline}>Tu recorrido, tu comunidad</Text></View>
      </View>
      <View pointerEvents="none" style={styles.shareSummary}>
        <Text style={styles.shareEyebrow}>MI ACTIVIDAD · {date.toUpperCase()}</Text>
        <Text numberOfLines={2} style={styles.shareTitle}>{activity.title}</Text>
        <View style={styles.shareMetrics}>
          <ShareMetric label="DISTANCIA" value={`${activity.distanceKm.toFixed(2)} km`} />
          <ShareMetric label="DURACIÓN" value={duration} />
          <ShareMetric label="VELOCIDAD" value={`${activity.averageSpeedKmh.toFixed(1)} km/h`} />
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

function routeBounds(route: UserActivity['route']): [number, number, number, number] {
  const longitudes = route.map((point) => point.longitude);
  const latitudes = route.map((point) => point.latitude);
  const west = Math.min(...longitudes);
  const east = Math.max(...longitudes);
  const south = Math.min(...latitudes);
  const north = Math.max(...latitudes);
  const longitudePadding = Math.max((east - west) * 0.12, 0.003);
  const latitudePadding = Math.max((north - south) * 0.12, 0.003);
  return [west - longitudePadding, south - latitudePadding, east + longitudePadding, north + latitudePadding];
}


const styles = StyleSheet.create({
  screen: { backgroundColor: '#070707', flex: 1 },
  safeArea: { flex: 1 },
  content: { gap: 18, padding: 20, paddingBottom: 72 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  backButton: { alignItems: 'center', backgroundColor: '#1D1D1D', borderColor: '#393939', borderRadius: 21, borderWidth: 1, height: 42, justifyContent: 'center', width: 42 },
  backButtonText: { color: '#FFFFFF', fontSize: 31, fontWeight: '400', lineHeight: 34, marginTop: -3 },
  headerBrand: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  headerLogo: { height: 60, width: 60 },
  headerBrandText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  headerSpacer: { width: 42 },
  title: { color: '#FFFFFF', fontSize: 30, fontWeight: '900' },
  subtitle: { color: '#A8A8A8', fontSize: 12, lineHeight: 18, marginTop: 5 },
  segmentedControl: { backgroundColor: '#151515', borderColor: '#303030', borderRadius: 14, borderWidth: 1, flexDirection: 'row', padding: 5 },
  segment: { alignItems: 'center', borderRadius: 10, flex: 1, minHeight: 43, justifyContent: 'center', paddingHorizontal: 7 },
  segmentActive: { backgroundColor: '#FF7900' },
  segmentText: { color: '#AFAFAF', fontSize: 10, fontWeight: '900', textAlign: 'center' },
  segmentTextActive: { color: '#111111' },
  list: { gap: 11 },
  registrationCard: { backgroundColor: '#151515', borderColor: '#303030', borderRadius: 16, borderWidth: 1, gap: 7, padding: 15 },
  recordedCard: { backgroundColor: '#151515', borderColor: '#303030', borderRadius: 17, borderWidth: 1, gap: 8, padding: 15 },
  recordedCardLatest: { backgroundColor: '#19130E', borderColor: '#8C4B16' },
  cardTopRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  eyebrow: { color: '#FF9A45', fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  confirmedPill: { backgroundColor: '#162510', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 },
  confirmedText: { color: '#8BE75A', fontSize: 8, fontWeight: '900' },
  routeState: { color: '#A9A9A9', fontSize: 9, fontWeight: '700' },
  cardTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '900', lineHeight: 22 },
  cardMeta: { color: '#BDBDBD', fontSize: 11, lineHeight: 16 },
  registrationDetail: { color: '#FFB35F', fontSize: 11, fontWeight: '900', marginTop: 2 },
  metrics: { backgroundColor: '#0E0E0E', borderRadius: 12, flexDirection: 'row', marginTop: 3, paddingVertical: 12 },
  metric: { alignItems: 'center', flex: 1 },
  metricValue: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  metricLabel: { color: '#8E8E8E', fontSize: 8, fontWeight: '800', marginTop: 3 },
  actions: { flexDirection: 'row', gap: 9, marginTop: 3 },
  secondaryButton: { alignItems: 'center', borderColor: '#565656', borderRadius: 11, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 43 },
  secondaryButtonText: { color: '#E7E7E7', fontSize: 11, fontWeight: '900' },
  shareButton: { alignItems: 'center', backgroundColor: '#FF7900', borderRadius: 11, flex: 1.25, justifyContent: 'center', minHeight: 43 },
  shareButtonText: { color: '#111111', fontSize: 11, fontWeight: '900' },
  buttonDisabled: { opacity: 0.5 },
  stateCard: { alignItems: 'center', backgroundColor: '#151515', borderColor: '#303030', borderRadius: 17, borderStyle: 'dashed', borderWidth: 1, gap: 8, padding: 28 },
  stateTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '900', textAlign: 'center' },
  stateText: { color: '#A8A8A8', fontSize: 11, lineHeight: 17, textAlign: 'center' },
  futureCard: { backgroundColor: '#121A23', borderColor: '#30445B', borderRadius: 15, borderWidth: 1, padding: 14 },
  futureTitle: { color: '#A9D0FF', fontSize: 12, fontWeight: '900' },
  futureText: { color: '#BFCADA', fontSize: 10, lineHeight: 15, marginTop: 5 },
  copyright: { color: '#666666', fontSize: 9, textAlign: 'center' },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.76)', flex: 1, justifyContent: 'center', padding: 22 },
  renameDialog: { backgroundColor: '#171717', borderColor: '#3A3A3A', borderRadius: 20, borderWidth: 1, padding: 18, width: '100%' },
  modalTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  modalText: { color: '#AFAFAF', fontSize: 11, lineHeight: 16, marginTop: 6 },
  renameInput: { backgroundColor: '#0B0B0B', borderColor: '#595959', borderRadius: 12, borderWidth: 1, color: '#FFFFFF', fontSize: 14, marginTop: 15, minHeight: 49, paddingHorizontal: 13 },
  characterCount: { color: '#777777', fontSize: 9, marginTop: 5, textAlign: 'right' },
  errorText: { color: '#FF9B86', fontSize: 10, fontWeight: '700', marginTop: 6 },
  modalActions: { flexDirection: 'row', gap: 9, marginTop: 16 },
  modalCancel: { alignItems: 'center', borderColor: '#4A4A4A', borderRadius: 11, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 45 },
  modalCancelText: { color: '#E0E0E0', fontSize: 11, fontWeight: '900' },
  modalSave: { alignItems: 'center', backgroundColor: '#FF7900', borderRadius: 11, flex: 1.35, justifyContent: 'center', minHeight: 45 },
  modalSaveText: { color: '#111111', fontSize: 11, fontWeight: '900' },
  shareScreen: { backgroundColor: '#090909', flex: 1 },
  shareSafeArea: { flex: 1 },
  shareHeader: { alignItems: 'center', borderBottomColor: '#292929', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: 16 },
  shareClose: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 },
  shareCloseText: { color: '#FFFFFF', fontSize: 32, fontWeight: '300' },
  shareHeaderTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  shareContent: { alignItems: 'center', gap: 14, padding: 18 },
  shareFooter: { alignItems: 'center', backgroundColor: '#090909', borderTopColor: '#292929', borderTopWidth: 1, gap: 10, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 14 },
  shareCard: { aspectRatio: 9 / 16, backgroundColor: '#07111F', maxWidth: 380, overflow: 'hidden', position: 'relative', width: '100%' },
  shareGradientTop: { backgroundColor: 'rgba(3,9,17,0.5)', height: '28%', left: 0, position: 'absolute', right: 0, top: 0 },
  shareBrand: { alignItems: 'center', flexDirection: 'row', gap: 9, left: 18, position: 'absolute', right: 18, top: 20 },
  shareLogoFrame: { backgroundColor: '#FFFFFF', borderColor: 'rgba(255,255,255,0.82)', borderRadius: 27, borderWidth: 2, height: 54, overflow: 'hidden', width: 54 },
  shareLogo: { height: 54, width: 54 },
  shareBrandName: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  shareBrandTagline: { color: '#E4E7EA', fontSize: 8, fontWeight: '700', marginTop: 2 },
  shareSummary: { backgroundColor: 'rgba(4,10,18,0.9)', bottom: 0, left: 0, padding: 21, position: 'absolute', right: 0 },
  shareEyebrow: { color: '#FF9A45', fontSize: 8, fontWeight: '900', letterSpacing: 0.7 },
  shareTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', lineHeight: 28, marginTop: 7 },
  shareMetrics: { flexDirection: 'row', marginTop: 17 },
  shareMetric: { flex: 1 },
  shareMetricLabel: { color: '#AEB6C0', fontSize: 7, fontWeight: '900' },
  shareMetricValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', marginTop: 4 },
  shareCopyright: { color: '#89929E', fontSize: 7, marginTop: 17 },
  shareAttribution: { color: '#89929E', fontSize: 6, marginTop: 3 },
  mapPin: { alignItems: 'center', borderColor: '#FFFFFF', borderRadius: 13, borderWidth: 2, paddingHorizontal: 8, paddingVertical: 5 },
  mapPinStart: { backgroundColor: '#2F9B55' },
  mapPinFinish: { backgroundColor: '#FF5B35' },
  mapPinText: { color: '#FFFFFF', fontSize: 8, fontWeight: '900' },
  shareHelp: { color: '#AFAFAF', fontSize: 11, lineHeight: 16, maxWidth: 380, textAlign: 'center' },
  shareAction: { alignItems: 'center', backgroundColor: '#FF7900', borderRadius: 13, justifyContent: 'center', maxWidth: 380, minHeight: 49, paddingHorizontal: 28, width: '100%' },
  shareActionText: { color: '#111111', fontSize: 13, fontWeight: '900' },
  required: { alignItems: 'center', justifyContent: 'center', padding: 28 },
  requiredLogo: { height: 110, width: 110 },
  requiredTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', marginBottom: 20, marginTop: 15, textAlign: 'center' },
});
