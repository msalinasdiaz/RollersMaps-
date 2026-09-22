import { Camera, type CameraRef, GeoJSONSource, Layer, Map, ViewAnnotation } from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GpsTargetIcon } from '@/components/gps-target-icon';
import { useDemoSession } from '@/contexts/demo-session';
import { activityTypeLabels, getActivityTiming } from '@/data/activities';
import { useActivities } from '@/hooks/use-activities';
import { syncLocalActivities } from '@/lib/local-sync';
import {
  archiveTrackingSession,
  flushLocationQueue,
  getTrackingSnapshot,
  markTrackingPendingSave,
  startLocalTrackingSession,
  type TrackingSnapshot,
} from '@/lib/tracking-store';
import {
  startActiveLocationService,
  stopActiveLocationService,
} from '@/tasks/background-location';

type MapCoordinate = { latitude: number; longitude: number };
type TrackingOption = {
  groupActivityId: string | null;
  id: string;
  kind: 'group' | 'free';
  meta: string;
  title: string;
};

const defaultCenter: MapCoordinate = { latitude: -33.4324, longitude: -70.6498 };
const mapStyleUrl = 'https://tiles.openfreemap.org/styles/dark';
const locationTimeoutMs = 12_000;
const freeOption: TrackingOption = { groupActivityId: null, id: 'free', kind: 'free', meta: 'Salida personal', title: 'Ruta libre' };

export default function TrackScreen() {
  const { user } = useDemoSession();
  if (!user) return <Redirect href="/welcome" />;
  return <Tracker key={user.id} ownerId={user.id} />;
}

function Tracker({ ownerId }: { ownerId: string }) {
  const params = useLocalSearchParams<{ activityId?: string }>();
  const requestedActivityId = Array.isArray(params.activityId) ? params.activityId[0] : params.activityId;
  const { isJoined, notifyRecordedActivitySaved, user } = useDemoSession();
  const { activities, isLoading: activitiesLoading } = useActivities(true);
  const [userLocation, setUserLocation] = useState<MapCoordinate | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [snapshot, setSnapshot] = useState<TrackingSnapshot | null>(null);
  const [lastCompletedSnapshot, setLastCompletedSnapshot] = useState<TrackingSnapshot | null>(null);
  const [message, setMessage] = useState('Toca Inicio para preparar el GPS.');
  const [referenceTime, setReferenceTime] = useState(() => new Date());
  const [recenterRequest, setRecenterRequest] = useState(0);
  const locationRequestRef = useRef(false);
  const screenMountedRef = useRef(true);

  const requestedActivity = useMemo(
    () => requestedActivityId ? activities.find((item) => item.id === requestedActivityId && isJoined(item.id)) : undefined,
    [activities, isJoined, requestedActivityId],
  );
  const selectedOption: TrackingOption = requestedActivity ? {
    groupActivityId: requestedActivity.id,
    id: `group:${requestedActivity.id}`,
    kind: 'group',
    meta: `${activityTypeLabels[requestedActivity.type]} · ${requestedActivity.time} · ${requestedActivity.meetingPoint}`,
    title: requestedActivity.title,
  } : freeOption;
  const timing = requestedActivity ? getActivityTiming(requestedActivity, referenceTime) : null;
  const isTracking = snapshot?.status === 'active';
  const isPendingSave = snapshot?.status === 'pending_save';
  const isEventLocked = Boolean(!isTracking && !isPendingSave && requestedActivity && !timing?.canStart);
  const eventHasEnded = Boolean(requestedActivity && timing?.hasEnded);
  const displayedSnapshot = snapshot ?? lastCompletedSnapshot;
  const elapsedSeconds = displayedSnapshot?.durationSeconds ?? 0;
  const distanceKm = displayedSnapshot?.distanceKm ?? 0;
  const averageSpeed = displayedSnapshot?.averageSpeedKmh ?? 0;
  const storedRoute = displayedSnapshot?.route;
  const trackedRoute = useMemo(
    () => storedRoute?.map(({ latitude, longitude }) => ({ latitude, longitude })) ?? [],
    [storedRoute],
  );
  const displayTitle = displayedSnapshot?.title ?? selectedOption.title;
  const displayMeta = displayedSnapshot
    ? `${displayedSnapshot.activityType === 'group_activity' ? 'Actividad del grupo' : 'Salida personal'} · ${snapshot?.status === 'active' ? 'registro activo' : snapshot?.status === 'pending_save' ? 'pendiente de guardar' : 'registro finalizado'}`
    : selectedOption.meta;

  useEffect(() => {
    const interval = setInterval(() => setReferenceTime(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let isMounted = true;
    screenMountedRef.current = true;

    const refreshLocalTracking = () => {
      const localSnapshot = getTrackingSnapshot(ownerId);
      if (!isMounted) return;
      setSnapshot(localSnapshot);
      const lastPoint = localSnapshot?.route.at(-1);
      if (lastPoint) setUserLocation({ latitude: lastPoint.latitude, longitude: lastPoint.longitude });
    };

    const restoreTracking = async () => {
      const localSnapshot = getTrackingSnapshot(ownerId);
      if (!isMounted || !localSnapshot) return;
      setSnapshot(localSnapshot);
      const lastPoint = localSnapshot.route.at(-1);
      if (lastPoint) {
        setUserLocation({ latitude: lastPoint.latitude, longitude: lastPoint.longitude });
        setRecenterRequest((current) => current + 1);
      }
      if (localSnapshot.status === 'active') {
        try {
          await startActiveLocationService();
          if (isMounted) setMessage('Recuperamos tu ruta. El GPS sigue registrando en segundo plano.');
        } catch {
          if (isMounted) setMessage('Recuperamos tu ruta, pero debes reactivar el permiso de ubicación para continuar.');
        }
      } else if (isMounted) {
        setMessage('Tu recorrido está seguro en este teléfono. Toca Guardar para finalizar.');
      }
    };

    void restoreTracking();
    const interval = setInterval(refreshLocalTracking, 1000);
    return () => { isMounted = false; screenMountedRef.current = false; clearInterval(interval); };
  }, [ownerId]);

  const getDeviceLocation = useCallback(async (): Promise<Location.LocationObject | null> => {
    if (locationRequestRef.current) return null;
    locationRequestRef.current = true;
    setIsLocating(true);
    setMessage('Buscando tu ubicación…');
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted') permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setMessage('Necesitamos acceso a tu ubicación mientras ocupas la ruta.');
        return null;
      }
      if (!await Location.hasServicesEnabledAsync()) {
        setMessage('Enciende el GPS del teléfono para comenzar.');
        return null;
      }
      let lastKnown: Location.LocationObject | null = null;
      try {
        lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 2 * 60_000, requiredAccuracy: 80 });
      } catch { lastKnown = null; }
      if (lastKnown) setUserLocation({ latitude: lastKnown.coords.latitude, longitude: lastKnown.coords.longitude });
      let current: Location.LocationObject | null = null;
      try {
        current = await Promise.race<Location.LocationObject | null>([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), locationTimeoutMs)),
        ]);
      } catch { current = null; }
      const location = current ?? lastKnown;
      if (!location) { setMessage('No encontramos tu ubicación. Revisa el GPS e inténtalo de nuevo.'); return null; }
      const coordinates = { latitude: location.coords.latitude, longitude: location.coords.longitude };
      setUserLocation(coordinates);
      setRecenterRequest((currentValue) => currentValue + 1);
      setMessage('Ubicación lista.');
      return location;
    } catch {
      setMessage('No pudimos usar el GPS. Revisa la ubicación del teléfono.');
      return null;
    } finally {
      locationRequestRef.current = false;
      setIsLocating(false);
    }
  }, []);

  const ensureBackgroundPermission = useCallback(async () => {
    if (!await Location.isBackgroundLocationAvailableAsync()) {
      Alert.alert('Seguimiento no disponible', 'Este teléfono no permite mantener el GPS activo en segundo plano.');
      return false;
    }

    let backgroundPermission = await Location.getBackgroundPermissionsAsync();
    if (backgroundPermission.status === 'granted') return true;

    const shouldOpenSettings = await new Promise<boolean>((resolve) => {
      Alert.alert(
        'Permite la ubicación siempre',
        'Para que no se corte el recorrido al apagar la pantalla o salir de RollersMaps, elige “Permitir todo el tiempo” en el siguiente paso.',
        [
          { onPress: () => resolve(false), style: 'cancel', text: 'Ahora no' },
          { onPress: () => resolve(true), text: Platform.OS === 'android' ? 'Abrir ajustes' : 'Continuar' },
        ],
        { cancelable: false },
      );
    });
    if (!shouldOpenSettings) return false;

    backgroundPermission = await Location.requestBackgroundPermissionsAsync();
    if (backgroundPermission.status !== 'granted') {
      Alert.alert('Falta un permiso', 'Activa “Permitir todo el tiempo” para registrar una ruta sin cortes.');
      return false;
    }
    return true;
  }, []);

  const saveSnapshot = useCallback(async (localSnapshot: TrackingSnapshot) => {
    setIsSaving(true);
    try {
      archiveTrackingSession(localSnapshot);
      setLastCompletedSnapshot(localSnapshot);
      setSnapshot(null);
      notifyRecordedActivitySaved();
      setMessage('Recorrido guardado en este teléfono. Encuéntralo en Mis rutas.');
      if (user && localSnapshot.userId === user.id) {
        const error = await syncLocalActivities(user.id);
        setMessage(error ?? 'Recorrido guardado y respaldado en tu cuenta.');
        notifyRecordedActivitySaved();
      }
      return true;
    } catch {
      setMessage('No pudimos completar el guardado. Tu registro sigue disponible para reintentar.');
      return false;
    } finally { setIsSaving(false); }
  }, [notifyRecordedActivitySaved, user]);

  const toggleTracking = async () => {
    if (isLocating || isSaving || isEventLocked) return;
    if (isPendingSave && snapshot) {
      await saveSnapshot(snapshot);
      return;
    }

    if (isTracking) {
      setIsSaving(true);
      try { await stopActiveLocationService(); } catch { /* The local session still prevents new points. */ }
      await flushLocationQueue();
      markTrackingPendingSave();
      const finalSnapshot = getTrackingSnapshot(ownerId);
      setSnapshot(finalSnapshot);
      setIsSaving(false);
      setMessage('Guardando tu actividad…');
      if (finalSnapshot) await saveSnapshot(finalSnapshot);
      return;
    }


    const initialLocation = await getDeviceLocation();
    if (!initialLocation) return;
    if (!await ensureBackgroundPermission()) {
      setMessage('Necesitamos ubicación en segundo plano para evitar que tu ruta se corte.');
      return;
    }

    if (!screenMountedRef.current) return;
    try {
    startLocalTrackingSession({
      activityType: selectedOption.kind === 'group' ? 'group_activity' : 'free_route',
      groupActivityId: selectedOption.groupActivityId,
      initialLocation,
      title: selectedOption.title,
      userId: ownerId,
    });
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No pudimos iniciar el recorrido.'); return; }
    const localSnapshot = getTrackingSnapshot(ownerId);
    setSnapshot(localSnapshot);
    setLastCompletedSnapshot(null);
    setMessage('Ruta en curso. Puedes apagar la pantalla o dejar la app en segundo plano.');
    try {
      await startActiveLocationService();
    } catch {
      markTrackingPendingSave();
      setSnapshot(getTrackingSnapshot(ownerId));
      setMessage('No pudimos mantener el GPS activo. Puedes guardar el registro y revisar los permisos.');
    }
  };

  const goBack = () => {
    if (isTracking) { Alert.alert('Ruta en curso', 'Finaliza y guarda la actividad antes de volver.'); return; }
    router.back();
  };

  if (requestedActivityId && activitiesLoading && !snapshot) return <LoadingScreen />;
  if (requestedActivityId && !requestedActivity && !snapshot) return <View style={[styles.screen, { justifyContent: 'center', padding: 24, gap: 20 }]}><Text style={{ color: '#FFFFFF', fontSize: 18 }}>Esta actividad no está disponible para tu cuenta.</Text><Pressable accessibilityRole="button" onPress={() => router.replace('/track')}><Text style={{ color: '#FF9A45', fontSize: 17 }}>Patinar libre</Text></Pressable></View>;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <TrackerMap recenterRequest={recenterRequest} trackedRoute={trackedRoute} userLocation={userLocation} />
      <SafeAreaView edges={['top', 'bottom']} pointerEvents="box-none" style={styles.overlay}>
        <View style={styles.topBar} pointerEvents="box-none">
          <Pressable accessibilityLabel="Volver" accessibilityRole="button" onPress={goBack} style={styles.roundControl}><Text style={styles.backIcon}>‹</Text></Pressable>
          <View style={[styles.statusPill, (isTracking || isPendingSave) && styles.statusPillActive]}><View style={[styles.statusDot, isTracking && styles.statusDotActive]} /><Text style={styles.statusText}>{isTracking ? 'EN CURSO' : isPendingSave ? 'POR GUARDAR' : 'LISTA'}</Text></View>
        </View>

        <View style={styles.lowerDock}>
          <View style={styles.metricsCard}>
            <View style={styles.metricsHeader}>
              <View style={styles.metricsHeading}>
                <Text numberOfLines={1} style={styles.metricsTitle}>{displayTitle}</Text>
                <Text numberOfLines={1} style={styles.metricsMeta}>{displayMeta}</Text>
              </View>
              <Text style={styles.expandIcon}>↗</Text>
            </View>
            <View style={styles.statsRow}>
              <Metric label="Duración" value={formatDuration(elapsedSeconds)} />
              <Metric label="Veloc. media" suffix="km/h" value={formatDecimal(averageSpeed)} />
              <Metric label="Distancia" suffix="km" value={formatDistance(distanceKm)} />
            </View>
            <Text accessibilityLiveRegion="polite" numberOfLines={2} style={styles.message}>{eventHasEnded ? 'Esta actividad ya finalizó.' : isEventLocked && requestedActivity ? `Se habilita a partir de las ${requestedActivity.time}.` : message}</Text>
          </View>

          <View style={styles.actionDock}>
            <View style={styles.sideAction}>
              <View style={[styles.sideCircle, styles.modeCircle]}><Text style={styles.modeIcon}>≋</Text></View>
              <Text numberOfLines={2} style={styles.sideLabel}>{selectedOption.kind === 'group' ? 'Actividad\ndel grupo' : 'Patinaje\nen línea'}</Text>
            </View>
            <Pressable
              accessibilityLabel={isTracking ? 'Finalizar y guardar actividad' : isPendingSave ? 'Reintentar guardar actividad' : isEventLocked && requestedActivity ? `Registro disponible desde las ${requestedActivity.time}` : 'Iniciar registro GPS'}
              accessibilityRole="button"
              accessibilityState={{ disabled: isLocating || isSaving || isEventLocked, selected: isTracking }}
              disabled={isLocating || isSaving || isEventLocked}
              onPress={() => void toggleTracking()}
              style={[styles.centerAction, (isLocating || isSaving || isEventLocked) && styles.disabled]}>
              <View style={[styles.primaryCircle, isTracking && styles.primaryCircleStop]}>
                {isLocating || isSaving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryIcon}>{isTracking ? '■' : '▶'}</Text>}
              </View>
              <Text numberOfLines={1} style={styles.centerLabel}>{isSaving ? 'Guardando…' : isLocating ? 'Preparando…' : isTracking ? 'Finalizar' : isPendingSave ? 'Reintentar guardado' : eventHasEnded ? 'Finalizada' : isEventLocked && requestedActivity ? `Desde ${requestedActivity.time}` : trackedRoute.length ? 'Nueva actividad' : 'Inicio'}</Text>
            </Pressable>
            <Pressable accessibilityLabel="Centrar en mi ubicación" accessibilityRole="button" disabled={isLocating || isSaving} onPress={() => void getDeviceLocation()} style={[styles.sideAction, (isLocating || isSaving) && styles.disabled]}>
              <View style={styles.sideCircle}><GpsTargetIcon color="#FFFFFF" size={27} /></View>
              <Text numberOfLines={2} style={styles.sideLabel}>{'Centrar\nmapa'}</Text>
            </Pressable>
          </View>
          <Text style={styles.privacy}>El registro continúa en segundo plano mientras veas la notificación de RollersMaps.</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

function TrackerMap({
  recenterRequest,
  trackedRoute,
  userLocation,
}: {
  recenterRequest: number;
  trackedRoute: MapCoordinate[];
  userLocation: MapCoordinate | null;
}) {
  const [mapLoadState, setMapLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const cameraRef = useRef<CameraRef>(null);
  const lastHandledRecenterRequest = useRef(0);
  const trackedRouteFeature = {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'LineString' as const,
      coordinates: trackedRoute.map((coordinate) => [coordinate.longitude, coordinate.latitude]),
    },
  };

  useEffect(() => {
    if (mapLoadState !== 'ready' || !userLocation || recenterRequest === 0 || recenterRequest === lastHandledRecenterRequest.current) return;
    lastHandledRecenterRequest.current = recenterRequest;
    cameraRef.current?.easeTo({
      center: [userLocation.longitude, userLocation.latitude],
      duration: 450,
      zoom: 16,
    });
  }, [mapLoadState, recenterRequest, userLocation]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <Map
        androidView="texture"
        attribution
        attributionPosition={{ bottom: 270, left: 8 }}
        compass
        compassPosition={{ top: 76, right: 14 }}
        logo={false}
        mapStyle={mapStyleUrl}
        onDidFailLoadingMap={() => setMapLoadState('error')}
        onDidFinishLoadingMap={() => setMapLoadState('ready')}
        onWillStartLoadingMap={() => setMapLoadState('loading')}
        style={StyleSheet.absoluteFill}
      >
        <Camera initialViewState={{ center: [defaultCenter.longitude, defaultCenter.latitude], zoom: 12 }} ref={cameraRef} />
        {trackedRoute.length > 1 ? (
          <GeoJSONSource data={trackedRouteFeature} id="active-roller-track">
            <Layer
              id="active-roller-track-glow"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': '#512BFF', 'line-opacity': 0.35, 'line-width': 13 }}
              type="line"
            />
            <Layer
              id="active-roller-track-line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': '#7B61FF', 'line-opacity': 1, 'line-width': 5 }}
              type="line"
            />
          </GeoJSONSource>
        ) : null}
        {userLocation ? (
          <ViewAnnotation id="active-user-location" lngLat={[userLocation.longitude, userLocation.latitude]}>
            <View style={styles.mapUserMarker}><View style={styles.mapUserMarkerCenter} /></View>
          </ViewAnnotation>
        ) : null}
      </Map>
      {mapLoadState !== 'ready' ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.mapLoading]}>
          {mapLoadState === 'loading' ? <ActivityIndicator color="#FF7900" size="large" /> : null}
          <Text style={styles.mapLoadingText}>{mapLoadState === 'error' ? 'No pudimos cargar el mapa. Revisa tu conexión.' : 'Cargando el mapa…'}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Metric({ label, suffix, value }: { label: string; suffix?: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text numberOfLines={1} style={styles.metricValue}>{value}</Text>
      <Text numberOfLines={1} style={styles.metricLabel}>{label}{suffix ? ` · ${suffix}` : ''}</Text>
    </View>
  );
}

function LoadingScreen() {
  return <View style={styles.required}><ActivityIndicator color="#FF7900" size="large" /><Text style={styles.requiredText}>Preparando tu actividad…</Text></View>;
}


function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const remainingSeconds = (seconds % 60).toString().padStart(2, '0');
  return hours ? `${hours}:${minutes}:${remainingSeconds}` : `${minutes}:${remainingSeconds}`;
}

function formatDecimal(value: number) {
  return value.toFixed(1).replace('.', ',');
}

function formatDistance(value: number) {
  return value.toFixed(2).replace('.', ',');
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#0B0D12', flex: 1 },
  overlay: { ...StyleSheet.absoluteFill, justifyContent: 'space-between' },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14 },
  roundControl: { alignItems: 'center', backgroundColor: 'rgba(9,10,14,0.94)', borderColor: '#353742', borderRadius: 22, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 },
  backIcon: { color: '#FFFFFF', fontSize: 35, fontWeight: '500', lineHeight: 37, marginTop: -3 },
  statusPill: { alignItems: 'center', backgroundColor: 'rgba(9,10,14,0.9)', borderColor: '#343642', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 10, paddingVertical: 9 },
  statusPillActive: { borderColor: '#FF7900' },
  statusDot: { backgroundColor: '#7D8490', borderRadius: 4, height: 8, width: 8 },
  statusDotActive: { backgroundColor: '#7ED957' },
  statusText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900' },
  lowerDock: { gap: 8, paddingBottom: 4 },
  metricsCard: { backgroundColor: 'rgba(13,13,16,0.97)', borderColor: '#353541', borderRadius: 16, borderWidth: 1, marginHorizontal: 8, paddingHorizontal: 14, paddingBottom: 10, paddingTop: 9 },
  metricsHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  metricsHeading: { flex: 1, paddingLeft: 20 },
  metricsTitle: { color: '#FFFFFF', fontSize: 12, fontWeight: '900', textAlign: 'center' },
  metricsMeta: { color: '#9EA2AD', fontSize: 8, fontWeight: '700', marginTop: 1, textAlign: 'center' },
  expandIcon: { color: '#D8DAE1', fontSize: 15, fontWeight: '800' },
  statsRow: { flexDirection: 'row', marginTop: 7 },
  metric: { alignItems: 'center', flex: 1, minWidth: 0 },
  metricValue: { color: '#FFFFFF', fontSize: 24, fontVariant: ['tabular-nums'], fontWeight: '900' },
  metricLabel: { color: '#B7BAC3', fontSize: 8, fontWeight: '800', marginTop: 2, textAlign: 'center' },
  message: { color: '#C8CBD3', fontSize: 9, lineHeight: 12, marginTop: 6, minHeight: 12, textAlign: 'center' },
  actionDock: { alignItems: 'flex-start', backgroundColor: 'rgba(13,13,15,0.98)', borderTopColor: '#2E2E36', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-around', paddingBottom: 6, paddingHorizontal: 24, paddingTop: 9 },
  sideAction: { alignItems: 'center', minWidth: 74 },
  sideCircle: { alignItems: 'center', backgroundColor: '#3A3A3D', borderRadius: 25, height: 50, justifyContent: 'center', width: 50 },
  modeCircle: { backgroundColor: '#5A2410' },
  modeIcon: { color: '#FF7900', fontSize: 30, fontWeight: '900', lineHeight: 31 },
  sideLabel: { color: '#E3E3E7', fontSize: 8.5, lineHeight: 11, marginTop: 4, textAlign: 'center' },
  centerAction: { alignItems: 'center', marginTop: -3, minWidth: 96 },
  primaryCircle: { alignItems: 'center', backgroundColor: '#FF6300', borderColor: '#FF8C3A', borderRadius: 33, borderWidth: 1, elevation: 6, height: 66, justifyContent: 'center', shadowColor: '#FF6300', shadowOffset: { height: 3, width: 0 }, shadowOpacity: 0.28, shadowRadius: 7, width: 66 },
  primaryCircleStop: { backgroundColor: '#E84929', borderColor: '#FF765A' },
  primaryIcon: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', marginLeft: 2 },
  centerLabel: { color: '#FF7900', fontSize: 9, fontWeight: '900', marginTop: 4, textAlign: 'center' },
  disabled: { opacity: 0.58 },
  privacy: { backgroundColor: 'rgba(13,13,15,0.98)', color: '#7F828C', fontSize: 8, lineHeight: 11, marginTop: -8, paddingBottom: 2, textAlign: 'center' },
  mapLoading: { alignItems: 'center', backgroundColor: '#0B0A16', gap: 12, justifyContent: 'center' },
  mapLoadingText: { color: '#E5E7EB', fontSize: 12, fontWeight: '800', paddingHorizontal: 32, textAlign: 'center' },
  mapUserMarker: { alignItems: 'center', backgroundColor: 'rgba(74,123,255,0.25)', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  mapUserMarkerCenter: { backgroundColor: '#447BFF', borderColor: '#FFFFFF', borderRadius: 12, borderWidth: 3, height: 24, width: 24 },
  required: { alignItems: 'center', backgroundColor: '#0B0D12', flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  requiredIcon: { color: '#FF7900', fontSize: 34, fontWeight: '900', letterSpacing: 3 },
  requiredTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', marginTop: 18, textAlign: 'center' },
  requiredText: { color: '#B8BEC8', fontSize: 13, lineHeight: 19, marginTop: 10, textAlign: 'center' },
  requiredButton: { backgroundColor: '#FF7900', borderRadius: 25, marginTop: 24, minWidth: 190, paddingHorizontal: 24, paddingVertical: 15 },
  requiredButtonText: { color: '#111111', fontSize: 14, fontWeight: '900', textAlign: 'center' },
});
