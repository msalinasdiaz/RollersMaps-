import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import { Camera, GeoJSONSource, Layer, Map, ViewAnnotation } from '@maplibre/maplibre-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useDemoSession } from '@/contexts/demo-session';
import { activityTypeLabels } from '@/data/activities';
import { useActivities } from '@/hooks/use-activities';
import { useRoutes, type PublishedRoute } from '@/hooks/use-routes';
import { supabase } from '@/lib/supabase';

const brandLogo = require('@/assets/images/rollersmaps-adaptive-foreground.png');

const classLevels = [
  {
    level: 0,
    title: 'Base segura',
    summary: 'Primero construimos la confianza y el control que necesitas para patinar con seguridad.',
    skills: ['Desplazamiento y postura', 'Equilibrio y caídas seguras', 'Reducir velocidad con cuña', 'Frenar con cuña'],
  },
  {
    level: 1,
    title: 'Control y obstáculos',
    summary: 'Aprendes a moverte con más seguridad en la ciudad y a responder ante obstáculos simples.',
    skills: ['Reducir velocidad y frenar en T', 'Transiciones', 'Pasar cunetas, desniveles, adoquines, conos y rampas', 'Salto de 10 cm de alto y 10 cm de distancia', 'Equilibrio en un pie'],
  },
  {
    level: 2,
    title: 'Técnica en movimiento',
    summary: 'Sumas recursos técnicos para patinar con más fluidez y enfrentar recorridos de mayor exigencia.',
    skills: ['Transición en movimiento', 'Fakie a baja velocidad', 'Salto de 15 cm de alto y 15 cm de distancia', 'Iniciación a Powerslide y Soulslide'],
  },
  {
    level: 3,
    title: 'Dominio avanzado',
    summary: 'Refuerzas control, frenado y saltos para desenvolverte con mayor autonomía en las rutas.',
    skills: ['Frenos de emergencia efectivos', 'Powerslide y Soulslide', 'Salto sobre 15 cm', 'Combinar saltos y frenadas'],
  },
] as const;

const accessMessage = [
  'En nivel 0, primero completa las bases en clase antes de sumarte a una ruta.',
  'Con nivel 1 puedes participar en rutas de nivel 1.',
  'Con nivel 2 puedes participar en rutas de nivel 1 y 2.',
  'Con nivel 3 puedes participar en rutas de nivel 1, 2 y 3.',
];

type MapCoordinate = {
  latitude: number;
  longitude: number;
};

const mapDefaultCenter: MapCoordinate = { latitude: -33.4324, longitude: -70.6498 };
const openStreetMapStyleUrl = 'https://tiles.openfreemap.org/styles/liberty';
const LOCATION_TIMEOUT_MS = 12_000;
const MAX_LAST_KNOWN_LOCATION_AGE_MS = 5 * 60_000;
const TRACKING_MIN_SEGMENT_KM = 0.003;
const TRACKING_MAX_SEGMENT_KM = 0.5;
type TrackingActivityOption = {
  groupActivityId: string | null;
  id: string;
  kind: 'group' | 'free';
  title: string;
  meta: string;
  description: string;
};

const freeActivityOption: TrackingActivityOption = {
  description: 'Registra tu propio recorrido desde el punto donde estés.',
  groupActivityId: null,
  id: 'free',
  kind: 'free',
  meta: 'Tú decides por dónde patinar',
  title: 'Ruta libre',
};

export default function RoutesScreen() {
  const { isSignedIn } = useDemoSession();

  return isSignedIn ? <RoutesContent /> : <SignInRequired />;
}

function RoutesContent() {
  const { isJoined, notifyRecordedActivitySaved, signOut, user } = useDemoSession();
  const { activities: groupActivities } = useActivities(true);
  const { error: routesError, isLoading: areRoutesLoading, routes } = useRoutes();
  const [view, setView] = useState<'rutas' | 'niveles' | 'mapa'>('rutas');
  const [selectedLevel, setSelectedLevel] = useState(1);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<MapCoordinate | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState('Usa “Mi ubicación” cuando quieras centrar el mapa.');
  const [isTracking, setIsTracking] = useState(false);
  const [isSavingActivity, setIsSavingActivity] = useState(false);
  const [trackingStartedAt, setTrackingStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [distanceKm, setDistanceKm] = useState(0);
  const [trackedRoute, setTrackedRoute] = useState<MapCoordinate[]>([]);
  const [trackingMessage, setTrackingMessage] = useState('Aún no inicias un registro GPS.');
  const trackingSubscriptionRef = useRef<{ remove: () => void } | null>(null);
  const lastTrackedLocationRef = useRef<MapCoordinate | null>(null);
  const locationRequestRef = useRef(false);
  const [selectionReferenceTime] = useState(() => Date.now());
  const currentClass = classLevels[selectedLevel];
  const trackingActivityOptions = useMemo<TrackingActivityOption[]>(() => {
    const recentActivityCutoff = selectionReferenceTime - 2 * 60 * 60 * 1000;
    const enrolled = groupActivities
      .filter((activity) => isJoined(activity.id) && activity.date.getTime() >= recentActivityCutoff)
      .sort((left, right) => left.date.getTime() - right.date.getTime())
      .slice(0, 8)
      .map((activity) => ({
        description: `Este registro quedará asociado a “${activity.title}”.`,
        groupActivityId: activity.id,
        id: `group:${activity.id}`,
        kind: 'group' as const,
        meta: `${activityTypeLabels[activity.type]} · ${new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short' }).format(activity.date).replace('.', '')} · ${activity.meetingPoint}`,
        title: activity.title,
      }));

    return [...enrolled, freeActivityOption];
  }, [groupActivities, isJoined, selectionReferenceTime]);
  const selectedActivity = trackingActivityOptions.find((option) => option.id === selectedActivityId) ?? trackingActivityOptions[0];
  const handleSignOut = () => {
    signOut();
    router.replace('/');
  };

  useEffect(() => () => trackingSubscriptionRef.current?.remove(), []);


  useEffect(() => {
    if (!isTracking || !trackingStartedAt) {
      return undefined;
    }

    const interval = setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - trackingStartedAt) / 1000)));
    }, 1000);

    return () => clearInterval(interval);
  }, [isTracking, trackingStartedAt]);

  const title = view === 'rutas' ? 'Rutas' : view === 'niveles' ? 'Clases y niveles' : 'Mapa y GPS';
  const subtitle = view === 'rutas'
    ? 'Encuentra tu próxima ruta'
    : view === 'niveles'
      ? 'Avanza a tu ritmo y patina con seguridad'
      : 'Ubicación y recorrido en este dispositivo';

  const getDeviceLocation = useCallback(async (): Promise<MapCoordinate | null> => {
    if (locationRequestRef.current) {
      return null;
    }

    locationRequestRef.current = true;
    setIsLocating(true);
    setLocationMessage('Buscando tu ubicación…');

    try {
      let permission = await Location.getForegroundPermissionsAsync();

      if (permission.status !== 'granted') {
        permission = await Location.requestForegroundPermissionsAsync();
      }

      if (permission.status !== 'granted') {
        setLocationMessage('No autorizaste la ubicación. Puedes activarla cuando quieras desde los ajustes del teléfono.');
        return null;
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        setLocationMessage('El GPS del teléfono está apagado. Actívalo e inténtalo de nuevo.');
        return null;
      }

      let lastKnownLocation: Location.LocationObject | null = null;
      try {
        lastKnownLocation = await Location.getLastKnownPositionAsync({
          maxAge: MAX_LAST_KNOWN_LOCATION_AGE_MS,
          requiredAccuracy: 500,
        });
      } catch {
        lastKnownLocation = null;
      }

      if (lastKnownLocation) {
        setUserLocation({
          latitude: lastKnownLocation.coords.latitude,
          longitude: lastKnownLocation.coords.longitude,
        });
        setLocationMessage('Mostramos tu última ubicación mientras el GPS obtiene una posición nueva.');
      }

      let currentLocation: Location.LocationObject | null = null;
      try {
        currentLocation = await Promise.race<Location.LocationObject | null>([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), LOCATION_TIMEOUT_MS)),
        ]);
      } catch {
        currentLocation = null;
      }

      const location = currentLocation ?? lastKnownLocation;

      if (!location) {
        setLocationMessage('No pudimos obtener tu ubicación todavía. Revisa que el GPS esté activado e inténtalo de nuevo.');
        return null;
      }

      const coordinates = { latitude: location.coords.latitude, longitude: location.coords.longitude };
      setUserLocation(coordinates);
      setLocationMessage(currentLocation
        ? 'Tu ubicación está activa mientras usas la app.'
        : 'Mostramos tu última ubicación conocida mientras el GPS se actualiza.');
      return coordinates;
    } catch {
      setLocationMessage('No pudimos obtener tu ubicación. Revisa que el GPS esté activado e inténtalo de nuevo.');
      return null;
    } finally {
      locationRequestRef.current = false;
      setIsLocating(false);
    }
  }, []);

  const showMyLocation = useCallback(async () => {
    await getDeviceLocation();
  }, [getDeviceLocation]);

  const toggleTracking = async () => {
    if (isLocating || isSavingActivity) {
      return;
    }

    if (isTracking) {
      const endedAt = Date.now();
      const startedAt = trackingStartedAt ?? endedAt;
      const finalDurationSeconds = Math.max(elapsedSeconds, Math.floor((endedAt - startedAt) / 1000));
      const finalAverageSpeed = finalDurationSeconds > 0 ? distanceKm / (finalDurationSeconds / 3600) : 0;

      trackingSubscriptionRef.current?.remove();
      trackingSubscriptionRef.current = null;
      setIsTracking(false);
      setTrackingStartedAt(null);
      setLocationMessage('Registro detenido. Puedes volver a centrar el mapa con “Mi ubicación”.');
      setTrackingMessage('Guardando tu registro en Mis actividades…');
      setIsSavingActivity(true);

      if (!user) {
        setIsSavingActivity(false);
        setTrackingMessage('No pudimos guardar el registro porque tu sesión ya no está activa.');
        Alert.alert('Registro no guardado', 'Vuelve a ingresar a tu cuenta e inténtalo nuevamente.');
        return;
      }

      const { error } = await supabase.from('user_activities').insert({
        activity_type: selectedActivity.kind === 'group' ? 'group_activity' : 'free_route',
        average_speed_kmh: Number(finalAverageSpeed.toFixed(2)),
        distance_km: Number(distanceKm.toFixed(3)),
        duration_seconds: finalDurationSeconds,
        ended_at: new Date(endedAt).toISOString(),
        group_activity_id: selectedActivity.groupActivityId,
        route_geojson: trackedRoute.length > 1 ? {
          coordinates: trackedRoute.map((coordinate) => [coordinate.longitude, coordinate.latitude]),
          type: 'LineString',
        } : null,
        source: 'rollersmaps',
        started_at: new Date(startedAt).toISOString(),
        sync_status: 'not_connected',
        title: selectedActivity.title,
        user_id: user.id,
      });

      setIsSavingActivity(false);

      if (error) {
        setTrackingMessage('El recorrido terminó, pero no pudimos guardarlo en tu cuenta.');
        Alert.alert('No pudimos guardar tu actividad', 'Revisa tu conexión y que el historial esté activado en Supabase. Tus datos siguen visibles en esta pantalla.');
        return;
      }

      notifyRecordedActivitySaved();
      setTrackingMessage('Registro guardado de forma privada en Mis actividades.');
      Alert.alert('¡Actividad guardada!', 'Tu recorrido ya aparece en Mis actividades y solo tú puedes verlo.');
      return;
    }

    const initialLocation = await getDeviceLocation();
    if (!initialLocation) {
      return;
    }

    lastTrackedLocationRef.current = initialLocation;
    setDistanceKm(0);
    setTrackedRoute([initialLocation]);
    setElapsedSeconds(0);
    setTrackingStartedAt(Date.now());
    setIsTracking(true);
    setTrackingMessage('Registro GPS iniciado. La ubicación se actualizará mientras usas RollersMaps.');

    try {
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 3000,
          distanceInterval: 5,
        },
        (location) => {
          const nextLocation = { latitude: location.coords.latitude, longitude: location.coords.longitude };
          const previousLocation = lastTrackedLocationRef.current;

          if (previousLocation) {
            const segmentDistance = distanceBetween(previousLocation, nextLocation);

            if (segmentDistance >= TRACKING_MIN_SEGMENT_KM && segmentDistance <= TRACKING_MAX_SEGMENT_KM) {
              setDistanceKm((currentDistance) => currentDistance + segmentDistance);
              setTrackedRoute((route) => [...route.slice(-999), nextLocation]);
            }
          }

          lastTrackedLocationRef.current = nextLocation;
          setUserLocation(nextLocation);
          setLocationMessage('Tu ubicación se está actualizando en el mapa.');
        },
      );

      trackingSubscriptionRef.current = subscription;
    } catch {
      setIsTracking(false);
      setTrackingStartedAt(null);
      setLocationMessage('Se detuvo la actualización de ubicación. Revisa el GPS e inténtalo otra vez.');
      setTrackingMessage('No pudimos iniciar el seguimiento. Revisa el GPS e inténtalo otra vez.');
    }
  };


  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <View style={styles.brandIdentity}>
              <View style={styles.brandIconFrame}>
                <Image source={brandLogo} resizeMode="contain" style={styles.brandIcon} />
              </View>
              <Text style={styles.brandName}>RollersMaps</Text>
            </View>
            <Pressable accessibilityLabel="Cerrar sesión" accessibilityRole="button" onPress={handleSignOut} style={styles.profile}>
              <Text style={styles.profileText}>Salir</Text>
            </Pressable>
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          <View style={styles.switcher}>
            <Pressable accessibilityRole="tab" accessibilityState={{ selected: view === 'rutas' }} onPress={() => setView('rutas')} style={[styles.switchButton, view === 'rutas' && styles.switchActive]}>
              <Text style={[styles.switchText, view === 'rutas' && styles.switchTextActive]}>Rutas</Text>
            </Pressable>
            <Pressable accessibilityRole="tab" accessibilityState={{ selected: view === 'niveles' }} onPress={() => setView('niveles')} style={[styles.switchButton, view === 'niveles' && styles.switchActive]}>
              <Text style={[styles.switchText, view === 'niveles' && styles.switchTextActive]}>Niveles</Text>
            </Pressable>
          </View>

          {view !== 'mapa' ? (
            <View style={styles.levelPanel}>
              <Text style={styles.levelPanelTitle}>{'¿Cuál es tu nivel actual?'}</Text>
              <View style={styles.levelButtons}>
                {classLevels.map((item) => (
                  <Pressable accessibilityLabel={`Nivel ${item.level}`} accessibilityRole="button" accessibilityState={{ selected: selectedLevel === item.level }} key={item.level} onPress={() => setSelectedLevel(item.level)} style={[styles.levelButton, selectedLevel === item.level && styles.levelButtonActive]}>
                    <Text style={[styles.levelButtonText, selectedLevel === item.level && styles.levelButtonTextActive]}>N{item.level}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.accessText}>{accessMessage[selectedLevel]}</Text>
            </View>
          ) : null}

          {view === 'rutas' ? <RoutesList selectedLevel={selectedLevel} routes={routes} isLoading={areRoutesLoading} error={routesError} /> : null}
          {view === 'niveles' ? <ClassLevelDetail level={currentClass} /> : null}
          {view === 'mapa' ? (
            <LiveMap
              selectedActivity={selectedActivity}
              activityOptions={trackingActivityOptions}
              onSelectActivity={(activity) => setSelectedActivityId(activity.id)}
              userLocation={userLocation}
              locationMessage={locationMessage}
              onShowMyLocation={showMyLocation}
              isLocating={isLocating}
              isTracking={isTracking}
              isSavingActivity={isSavingActivity}
              elapsedSeconds={elapsedSeconds}
              distanceKm={distanceKm}
              trackedRoute={trackedRoute}
              trackingMessage={trackingMessage}
              onToggleTracking={toggleTracking}
            />
          ) : null}

          <View style={styles.safety}>
            <Text style={styles.safetyTitle}>Casco obligatorio</Text>
            <Text style={styles.safetyText}>Para cuidar a todo el grupo, el equipo puede orientar tu participación según tu nivel técnico y las condiciones de la ruta.</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
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
            <Image source={brandLogo} resizeMode="contain" style={styles.requiredLogo} />
          </View>
          <Text style={styles.requiredTitle}>Rutas y mapa listos para ti</Text>
          <Text style={styles.requiredText}>Entra desde Inicio para revisar rutas, niveles y registrar un recorrido GPS.</Text>
          <Pressable accessibilityRole="button" onPress={() => router.navigate('/')} style={styles.requiredButton}>
            <Text style={styles.requiredButtonText}>Ir a Inicio</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}
function LiveMap({
  selectedActivity,
  activityOptions,
  onSelectActivity,
  userLocation,
  locationMessage,
  onShowMyLocation,
  isLocating,
  isTracking,
  isSavingActivity,
  elapsedSeconds,
  distanceKm,
  trackedRoute,
  trackingMessage,
  onToggleTracking,
}: {
  selectedActivity: TrackingActivityOption;
  activityOptions: TrackingActivityOption[];
  onSelectActivity: (activity: TrackingActivityOption) => void;
  userLocation: MapCoordinate | null;
  locationMessage: string;
  onShowMyLocation: () => void;
  isLocating: boolean;
  isTracking: boolean;
  isSavingActivity: boolean;
  elapsedSeconds: number;
  distanceKm: number;
  trackedRoute: MapCoordinate[];
  trackingMessage: string;
  onToggleTracking: () => void;
}) {
  const activity = selectedActivity;
  const averageSpeed = elapsedSeconds > 0 ? distanceKm / (elapsedSeconds / 3600) : 0;

  return (
    <View style={styles.mapSection}>
      <View style={styles.activitySelector}>
        <Text style={styles.activitySelectorTitle}>Elige la actividad</Text>
        <Text style={styles.activitySelectorText}>Elige una ruta o clase donde estés inscrito, o registra una salida personal.</Text>
        <ScrollView contentContainerStyle={styles.activityOptionsRow} horizontal showsHorizontalScrollIndicator={false}>
          {activityOptions.map((option) => {
            const isSelected = option.id === selectedActivity.id;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: isTracking || isSavingActivity, selected: isSelected }}
                disabled={isTracking || isSavingActivity}
                key={option.id}
                onPress={() => onSelectActivity(option)}
                style={[styles.activityOption, isSelected && styles.activityOptionActive, (isTracking || isSavingActivity) && styles.activityOptionDisabled]}>
                <Text style={[styles.activityOptionTitle, isSelected && styles.activityOptionTitleActive]}>{option.title}</Text>
                <Text numberOfLines={2} style={[styles.activityOptionMeta, isSelected && styles.activityOptionMetaActive]}>{option.meta}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.mapHeader}>
        <View>
          <Text style={styles.sectionTitle}>{activity.title}</Text>
          <Text style={styles.mapMeta}>{activity.meta}</Text>
        </View>
        <View style={styles.liveBadge}><View style={[styles.liveDot, isTracking && styles.liveDotTracking]} /><Text style={styles.liveText}>{isTracking ? 'Registrando' : 'En espera'}</Text></View>
      </View>

      <View style={styles.mapStage}>
        <OpenStreetMapLiveMap userLocation={userLocation} trackedRoute={trackedRoute} />
        <View style={styles.mapOverlayTop} pointerEvents="none">
          <Text style={styles.mapOverlayTitle}>{activity.title}</Text>
          <Text style={styles.mapOverlaySubtitle}>{activity.kind === 'group' ? 'Actividad del grupo' : 'Actividad personal'}</Text>
        </View>
        <Pressable
          accessibilityLabel={isLocating ? 'Buscando mi ubicación' : 'Centrar mapa en mi ubicación'}
          accessibilityRole="button"
          accessibilityState={{ disabled: isLocating || isSavingActivity }}
          disabled={isLocating || isSavingActivity}
          onPress={onShowMyLocation}
          style={[styles.mapLocationControl, (isLocating || isSavingActivity) && styles.controlDisabled]}>
          <Text style={styles.mapLocationControlText}>◎</Text>
        </Pressable>
        <View style={styles.trackingPanel}>
          <View style={styles.trackingPanelHeading}>
            <Text style={styles.trackingPanelTitle}>{isTracking ? 'Registro GPS activo' : trackedRoute.length ? 'Último registro' : 'Listo para registrar'}</Text>
            <View style={styles.trackingState}><View style={[styles.trackingStateDot, isTracking && styles.trackingStateDotActive]} /><Text style={styles.trackingStateText}>{isTracking ? 'Activo' : 'En espera'}</Text></View>
          </View>
          <View style={styles.statsRow}>
            <Stat value={formatDuration(elapsedSeconds)} label="Duración" />
            <Stat value={formatDecimal(averageSpeed)} label="Veloc. media (km/h)" />
            <Stat value={formatDecimal(distanceKm)} label="Distancia (km)" />
          </View>
        </View>
      </View>

      <Text accessibilityLiveRegion="polite" style={styles.mapStatus}>{locationMessage}</Text>
      <Text accessibilityLiveRegion="polite" style={styles.trackingMessage}>{trackingMessage}</Text>

      <View style={styles.activityControls}>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: isLocating || isSavingActivity }} disabled={isLocating || isSavingActivity} onPress={onShowMyLocation} style={[styles.secondaryActivityButton, (isLocating || isSavingActivity) && styles.controlDisabled]}>
          <Text style={styles.secondaryActivityButtonText}>{isLocating ? 'Buscando…' : 'Mi ubicación'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: isLocating || isSavingActivity, selected: isTracking }} disabled={isLocating || isSavingActivity} onPress={onToggleTracking} style={[styles.primaryActivityButton, isTracking && styles.primaryActivityButtonActive, (isLocating || isSavingActivity) && styles.controlDisabled]}>
          <Text style={styles.primaryActivityButtonText}>{isSavingActivity ? 'Guardando…' : isLocating ? 'Preparando GPS…' : isTracking ? 'Finalizar y guardar' : trackedRoute.length ? 'Nuevo registro' : 'Iniciar registro'}</Text>
        </Pressable>
      </View>

      <View style={styles.mapNotice}>
        <Text style={styles.mapNoticeTitle}>Privacidad del registro</Text>
        <Text style={styles.mapNoticeText}>{activity.description} Al finalizar, el recorrido queda guardado de forma privada en tu cuenta; no se comparte con otras personas.</Text>
      </View>
    </View>
  );
}

function OpenStreetMapLiveMap({ userLocation, trackedRoute }: { userLocation: MapCoordinate | null; trackedRoute: MapCoordinate[] }) {
  const [mapLoadState, setMapLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const center = userLocation ?? mapDefaultCenter;
  const trackedRouteFeature = {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'LineString' as const,
      coordinates: trackedRoute.map((coordinate) => [coordinate.longitude, coordinate.latitude]),
    },
  };

  return (
    <>
      <Map
        androidView="texture"
        style={styles.mapNative}
        mapStyle={openStreetMapStyleUrl}
        logo={false}
        attribution
        attributionPosition={{ bottom: 8, left: 8 }}
        compass
        compassPosition={{ top: 74, right: 12 }}
        onWillStartLoadingMap={() => setMapLoadState('loading')}
        onDidFinishLoadingMap={() => setMapLoadState('ready')}
        onDidFailLoadingMap={() => setMapLoadState('error')}
      >
        <Camera center={[center.longitude, center.latitude]} zoom={userLocation ? 15.5 : 12} duration={450} />
        {trackedRoute.length > 1 ? (
          <GeoJSONSource id="roller-track" data={trackedRouteFeature}>
            <Layer
              id="roller-track-line"
              type="line"
              paint={{
                'line-color': '#FF7900',
                'line-width': 5,
                'line-opacity': 0.92,
              }}
              layout={{
                'line-cap': 'round',
                'line-join': 'round',
              }}
            />
          </GeoJSONSource>
        ) : null}
        {userLocation ? (
          <ViewAnnotation id="my-location" lngLat={[userLocation.longitude, userLocation.latitude]}>
            <View style={styles.mapUserMarker}>
              <View style={styles.mapUserMarkerCenter} />
            </View>
          </ViewAnnotation>
        ) : null}
      </Map>
      {mapLoadState !== 'ready' ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.mapLoading]}>
          <Text style={styles.mapLoadingText}>
            {mapLoadState === 'error' ? 'No pudimos cargar el mapa. Revisa tu conexión e inténtalo otra vez.' : 'Cargando el mapa…'}
          </Text>
        </View>
      ) : null}
    </>
  );
}
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function distanceBetween(start: MapCoordinate, end: MapCoordinate) {
  const earthRadiusKm = 6371;
  const toRadians = (value: number) => value * (Math.PI / 180);
  const latitudeDifference = toRadians(end.latitude - start.latitude);
  const longitudeDifference = toRadians(end.longitude - start.longitude);
  const angle = Math.sin(latitudeDifference / 2) ** 2
    + Math.cos(toRadians(start.latitude)) * Math.cos(toRadians(end.latitude)) * Math.sin(longitudeDifference / 2) ** 2;

  return earthRadiusKm * (2 * Math.atan2(Math.sqrt(angle), Math.sqrt(1 - angle)));
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainingSeconds = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
}

function formatDecimal(value: number) {
  return value.toFixed(1).replace('.', ',');
}
type RouteGroupData = {
  level: number;
  routes: PublishedRoute[];
};

function RoutesList({ selectedLevel, routes, isLoading, error }: { selectedLevel: number; routes: PublishedRoute[]; isLoading: boolean; error: string | null }) {
  const routeGroups: RouteGroupData[] = [1, 2, 3, 4]
    .map((level) => ({
      level,
      routes: routes.filter((route) => route.skillLevel?.match(/\d/)?.[0] === level.toString()),
    }))
    .filter((group) => group.routes.length > 0);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Rutas por nivel</Text>
      <Text style={styles.sectionIntro}>Todas nuestras rutas son gratuitas. El nivel técnico define quién puede participar; la dificultad indica la exigencia de cada salida.</Text>
      {isLoading ? <Text style={styles.routeState}>Cargando las rutas publicadas…</Text> : null}
      {!isLoading && error ? <Text style={styles.routeState}>No pudimos cargar las rutas. Vuelve a intentarlo en un momento.</Text> : null}
      {!isLoading && !error && !routeGroups.length ? <Text style={styles.routeState}>Aún no hay rutas publicadas. El equipo las irá agregando por nivel.</Text> : null}
      {!isLoading && !error ? routeGroups.map((group) => <RouteGroup key={group.level} group={group} selectedLevel={selectedLevel} />) : null}
      <View style={styles.legend}>
        <Legend color="#74BD44" label="Baja" />
        <Legend color="#FFD14F" label="Media" />
        <Legend color="#E63345" label="Alta" />
      </View>
      <Text style={styles.legendHelp}>La dificultad se informará en la ficha de cada salida.</Text>
    </View>
  );
}

function RouteGroup({ group, selectedLevel }: { group: RouteGroupData; selectedLevel: number }) {
  const available = selectedLevel >= group.level && selectedLevel !== 0;

  return (
    <View style={[styles.routeGroup, available && styles.routeGroupAvailable]}>
      <View style={styles.routeGroupHeader}>
        <Text style={styles.routeGroupLevel}>Rutas de nivel {group.level}</Text>
        <Text style={[styles.routeGroupStatus, available && styles.routeGroupStatusAvailable]}>
          {available ? 'Puedes participar' : `Disponible desde nivel ${group.level}`}
        </Text>
      </View>
      <View style={styles.routeNames}>
        {group.routes.map((route) => (
          <View key={route.id} style={styles.routeNamePill}>
            <Text style={styles.routeNamePillText}>{route.name}</Text>
            {route.distanceKm ? <Text style={styles.routeNamePillMeta}>{route.distanceKm} km</Text> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function ClassLevelDetail({ level }: { level: (typeof classLevels)[number] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Nivel {level.level} {'·'} {level.title}</Text>
      <Text style={styles.sectionIntro}>{level.summary}</Text>
      <View style={styles.skillCard}>
        <Text style={styles.skillTitle}>En esta clase trabajamos:</Text>
        {level.skills.map((skill) => <Text key={skill} style={styles.skill}>{'✦'} {skill}</Text>)}
      </View>
      <View style={styles.progressCard}>
        <Text style={styles.progressTitle}>Cómo avanzar</Text>
        <Text style={styles.progressText}>Para pasar al nivel siguiente necesitas tener dominadas las técnicas del nivel actual. Si tienes dudas, consulta al equipo antes de inscribirte en una ruta.</Text>
      </View>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: color }]} /><Text style={styles.legendText}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#070707' },
  safeArea: { flex: 1 },
  content: { gap: 16, padding: 20, paddingBottom: 64 },
  topBar: { alignItems: 'center', flexDirection: 'row', height: 54, justifyContent: 'space-between' },
  menu: { color: '#F7F7F7', fontSize: 27, fontWeight: '300', width: 38 },
  logo: { height: 62, width: 136 },
  profile: { alignItems: 'center', backgroundColor: '#26201B', borderColor: '#7A4A23', borderRadius: 18, borderWidth: 1, minHeight: 40, justifyContent: 'center', paddingHorizontal: 13 },
  profileText: { color: '#FFB35F', fontSize: 11, fontWeight: '900' },
  title: { color: '#FFFFFF', fontSize: 30, fontWeight: '900', marginTop: 8 },
  subtitle: { color: '#A8A8A8', fontSize: 13, marginTop: -9 },
  switcher: { backgroundColor: '#151515', borderColor: '#303030', borderRadius: 13, borderWidth: 1, flexDirection: 'row', padding: 5 },
  switchButton: { alignItems: 'center', borderRadius: 9, flex: 1, paddingVertical: 9 },
  switchActive: { backgroundColor: '#FF7900' },
  switchText: { color: '#B5B5B5', fontSize: 12, fontWeight: '800' },
  switchTextActive: { color: '#171717' },
  levelPanel: { backgroundColor: '#161616', borderColor: '#303030', borderRadius: 16, borderWidth: 1, padding: 15 },
  levelPanelTitle: { color: '#F0F0F0', fontSize: 14, fontWeight: '900' },
  levelButtons: { flexDirection: 'row', gap: 8, marginTop: 12 },
  levelButton: { alignItems: 'center', backgroundColor: '#252525', borderRadius: 10, flex: 1, paddingVertical: 10 },
  levelButtonActive: { backgroundColor: '#FF7900' },
  levelButtonText: { color: '#BFBFBF', fontSize: 13, fontWeight: '900' },
  levelButtonTextActive: { color: '#121212' },
  accessText: { color: '#C8C8C8', fontSize: 11, lineHeight: 15, marginTop: 12 },
  section: { gap: 10 },
  sectionTitle: { color: '#F6F6F6', fontSize: 18, fontWeight: '900' },
  sectionIntro: { color: '#A7A7A7', fontSize: 12, lineHeight: 17 },
  routeGroup: { backgroundColor: '#141414', borderColor: '#2B2B2B', borderRadius: 15, borderWidth: 1, gap: 12, padding: 14 },
  routeGroupAvailable: { borderColor: '#FF7900' },
  routeGroupHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  routeGroupLevel: { color: '#F7F7F7', fontSize: 14, fontWeight: '900' },
  routeGroupStatus: { color: '#969696', fontSize: 10, fontWeight: '800' },
  routeGroupStatusAvailable: { color: '#FF9A45' },
  routeNames: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  routeNamePill: { backgroundColor: '#242424', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7 },
  routeNamePillText: { color: '#DEDEDE', fontSize: 10, fontWeight: '700' },
  routeNamePillMeta: { color: '#A8A8A8', fontSize: 8, fontWeight: '700', marginTop: 2 },
  routeState: { backgroundColor: '#141414', borderColor: '#303030', borderRadius: 14, borderWidth: 1, color: '#BEBEBE', fontSize: 11, lineHeight: 16, padding: 14 },
  legend: { alignItems: 'center', flexDirection: 'row', gap: 16, justifyContent: 'center', marginTop: 6 },
  legendItem: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  legendDot: { borderRadius: 5, height: 10, width: 10 },
  legendText: { color: '#B7B7B7', fontSize: 10, fontWeight: '700' },
  legendHelp: { color: '#8D8D8D', fontSize: 10, textAlign: 'center' },
  skillCard: { backgroundColor: '#171717', borderColor: '#303030', borderRadius: 16, borderWidth: 1, gap: 9, padding: 16 },
  skillTitle: { color: '#FF9A45', fontSize: 12, fontWeight: '900', marginBottom: 3 },
  skill: { color: '#F1F1F1', fontSize: 12, lineHeight: 17 },
  progressCard: { backgroundColor: '#281B10', borderColor: '#714319', borderRadius: 16, borderWidth: 1, padding: 15 },
  progressTitle: { color: '#FFB35F', fontSize: 12, fontWeight: '900' },
  progressText: { color: '#E0D0BF', fontSize: 11, lineHeight: 16, marginTop: 5 },
  mapSection: { gap: 12 },
  mapHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  mapMeta: { color: '#A7A7A7', fontSize: 11, marginTop: 3 },
  liveBadge: { alignItems: 'center', backgroundColor: '#222222', borderColor: '#3C3C3C', borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingVertical: 7 },
  liveDot: { backgroundColor: '#7F8794', borderRadius: 4, height: 8, width: 8 },
  liveDotTracking: { backgroundColor: '#82D84A' },
  liveText: { color: '#E8E8E8', fontSize: 10, fontWeight: '800' },
  mapFrame: { borderColor: '#393939', borderRadius: 18, borderWidth: 1, height: 330, overflow: 'hidden' },
  routePreview: { backgroundColor: '#121619', flex: 1, overflow: 'hidden', position: 'relative' },
  routeGrid: { backgroundColor: '#1E2A2D', bottom: 0, left: 0, opacity: 0.55, position: 'absolute', right: 0, top: 0 },
  routeLineOne: { backgroundColor: '#FF7900', borderRadius: 6, height: 7, left: '16%', position: 'absolute', top: '67%', transform: [{ rotate: '-36deg' }], width: '43%' },
  routeLineTwo: { backgroundColor: '#FF7900', borderRadius: 6, height: 7, left: '45%', position: 'absolute', top: '42%', transform: [{ rotate: '36deg' }], width: '34%' },
  routeLineThree: { backgroundColor: '#FF7900', borderRadius: 6, height: 7, left: '68%', position: 'absolute', top: '28%', transform: [{ rotate: '-28deg' }], width: '25%' },
  routePin: { alignItems: 'center', backgroundColor: '#171717', borderColor: '#FF7900', borderRadius: 14, borderWidth: 2, justifyContent: 'center', minWidth: 50, paddingHorizontal: 8, paddingVertical: 5, position: 'absolute' },
  routePinStart: { bottom: '18%', left: '12%' },
  routePinMiddle: { left: '48%', top: '42%' },
  routePinEnd: { right: '10%', top: '17%' },
  routePinText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900' },
  routeUserDot: { alignItems: 'center', backgroundColor: '#3182F6', borderColor: '#D8EDFF', borderRadius: 15, borderWidth: 2, height: 30, justifyContent: 'center', left: '43%', position: 'absolute', top: '24%', width: 30 },
  routeUserDotText: { color: '#FFFFFF', fontSize: 8, fontWeight: '900' },
  routePreviewCaption: { backgroundColor: 'rgba(7,7,7,0.8)', bottom: 0, left: 0, padding: 14, position: 'absolute', right: 0 },
  routePreviewTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  routePreviewText: { color: '#C9C9C9', fontSize: 10, marginTop: 3 },
  baseMapButton: { alignItems: 'center', backgroundColor: '#282828', borderColor: '#FF7900', borderRadius: 12, borderWidth: 1, paddingVertical: 12 },
  baseMapButtonText: { color: '#FF9A45', fontSize: 12, fontWeight: '900' },
  mapStatus: { color: '#B8B8B8', fontSize: 10, lineHeight: 14, textAlign: 'center' },
  locationButton: { alignItems: 'center', backgroundColor: '#FF7900', borderRadius: 12, paddingVertical: 14 },
  locationButtonText: { color: '#171717', fontSize: 13, fontWeight: '900' },
  locationHelp: { color: '#B8B8B8', fontSize: 11, lineHeight: 15, textAlign: 'center' },
  mapNotice: { backgroundColor: '#171717', borderColor: '#303030', borderRadius: 15, borderWidth: 1, padding: 14 },
  mapNoticeTitle: { color: '#FFAB5A', fontSize: 12, fontWeight: '900' },
  mapNoticeText: { color: '#C8C8C8', fontSize: 11, lineHeight: 16, marginTop: 5 },
  activitySelector: { backgroundColor: '#15151A', borderColor: '#343441', borderRadius: 16, borderWidth: 1, padding: 14 },
  activitySelectorTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  activitySelectorText: { color: '#B9BAC3', fontSize: 11, lineHeight: 15, marginTop: 4 },
  activityOptionsRow: { flexDirection: 'row', gap: 9, marginTop: 13 },
  activityOption: { backgroundColor: '#24242B', borderColor: '#3E3E49', borderRadius: 12, borderWidth: 1, minHeight: 76, padding: 11, width: 220 },
  activityOptionActive: { backgroundColor: '#2C1B0E', borderColor: '#FF7900' },
  activityOptionDisabled: { opacity: 0.72 },
  activityOptionTitle: { color: '#E8E8EC', fontSize: 12, fontWeight: '900' },
  activityOptionTitleActive: { color: '#FFAA59' },
  activityOptionMeta: { color: '#A5A5AF', fontSize: 9, fontWeight: '700', marginTop: 5 },
  activityOptionMetaActive: { color: '#F0C18B' },
  activityMapCanvas: { backgroundColor: '#141B27', flex: 1, overflow: 'hidden', position: 'relative' },
  activityMapGrid: { backgroundColor: '#1B2735', bottom: 0, left: 0, opacity: 0.8, position: 'absolute', right: 0, top: 0 },
  activityMapRoad: { backgroundColor: '#384C63', borderRadius: 8, height: 5, opacity: 0.82, position: 'absolute' },
  activityMapRoadOne: { left: '-12%', top: '31%', transform: [{ rotate: '-12deg' }], width: '124%' },
  activityMapRoadTwo: { left: '7%', top: '61%', transform: [{ rotate: '26deg' }], width: '108%' },
  activityMapRoadThree: { left: '27%', top: '-12%', transform: [{ rotate: '88deg' }], width: '114%' },
  activityMapRoadFour: { left: '66%', top: '-10%', transform: [{ rotate: '82deg' }], width: '112%' },
  activityRoute: { backgroundColor: '#B373FF', borderRadius: 8, height: 8, position: 'absolute' },
  activityRouteOne: { left: '13%', top: '69%', transform: [{ rotate: '-39deg' }], width: '43%' },
  activityRouteTwo: { left: '43%', top: '44%', transform: [{ rotate: '33deg' }], width: '34%' },
  activityRouteThree: { right: '10%', top: '26%', transform: [{ rotate: '-30deg' }], width: '26%' },
  activityPin: { alignItems: 'center', backgroundColor: '#121217', borderColor: '#B373FF', borderRadius: 13, borderWidth: 2, justifyContent: 'center', minWidth: 48, paddingHorizontal: 8, paddingVertical: 5, position: 'absolute' },
  activityPinStart: { bottom: '18%', left: '10%' },
  activityPinEnd: { right: '10%', top: '15%' },
  activityPinText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900' },
  freeRouteHint: { backgroundColor: 'rgba(16,18,25,0.92)', borderColor: '#48576C', borderRadius: 14, borderWidth: 1, left: 20, padding: 14, position: 'absolute', right: 20, top: '34%' },
  freeRouteHintTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '900', textAlign: 'center' },
  freeRouteHintText: { color: '#BEC5D0', fontSize: 10, lineHeight: 14, marginTop: 5, textAlign: 'center' },
  mapNative: { ...StyleSheet.absoluteFill },
  mapUserMarker: { alignItems: 'center', backgroundColor: 'rgba(39, 123, 255, 0.28)', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  mapUserMarkerCenter: { backgroundColor: '#277BFF', borderColor: '#FFFFFF', borderRadius: 13, borderWidth: 4, height: 26, width: 26 },
  mapStage: { backgroundColor: '#10151F', borderColor: '#3C4351', borderRadius: 20, borderWidth: 1, height: 460, overflow: 'hidden', position: 'relative' },
  mapWebView: { backgroundColor: '#10151F', flex: 1 },
  mapLoading: { alignItems: 'center', backgroundColor: '#10151F', flex: 1, justifyContent: 'center' },
  mapLoadingText: { color: '#D6C4FF', fontSize: 12, fontWeight: '800' },
  mapOverlayTop: { backgroundColor: 'rgba(13,15,23,0.88)', borderColor: '#3A4150', borderRadius: 13, borderWidth: 1, left: 14, paddingHorizontal: 12, paddingVertical: 8, position: 'absolute', top: 14 },
  mapOverlayTitle: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  mapOverlaySubtitle: { color: '#C3B4DD', fontSize: 9, fontWeight: '700', marginTop: 2 },
  mapUserDot: { backgroundColor: '#277BFF', borderColor: '#FFFFFF', borderRadius: 13, borderWidth: 4, height: 26, left: '50%', marginLeft: -13, marginTop: -13, position: 'absolute', top: '42%', width: 26 },
  mapLocationControl: { alignItems: 'center', backgroundColor: '#111319', borderColor: '#4A5161', borderRadius: 23, borderWidth: 1, height: 46, justifyContent: 'center', position: 'absolute', right: 14, top: 16, width: 46 },
  mapLocationControlText: { color: '#FFFFFF', fontSize: 28, fontWeight: '900', lineHeight: 29 },
  controlDisabled: { opacity: 0.58 },
  trackingPanel: { backgroundColor: 'rgba(12,12,15,0.96)', borderColor: '#3C3C42', borderRadius: 17, borderWidth: 1, bottom: 14, left: 14, padding: 15, position: 'absolute', right: 14 },
  trackingPanelHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 13 },
  trackingPanelTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  trackingState: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  trackingStateDot: { backgroundColor: '#7F8794', borderRadius: 4, height: 8, width: 8 },
  trackingStateDotActive: { backgroundColor: '#82D84A' },
  trackingStateText: { color: '#BFC3CD', fontSize: 10, fontWeight: '800' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statItem: { alignItems: 'center', flex: 1 },
  statValue: { color: '#FFFFFF', fontSize: 23, fontWeight: '900' },
  statLabel: { color: '#AEB3BF', fontSize: 9, fontWeight: '700', marginTop: 4, textAlign: 'center' },
  trackingMessage: { color: '#C8CCD5', fontSize: 10, lineHeight: 14, textAlign: 'center' },
  activityControls: { flexDirection: 'row', gap: 10 },
  secondaryActivityButton: { alignItems: 'center', backgroundColor: '#24262D', borderColor: '#484D59', borderRadius: 13, borderWidth: 1, flex: 1, justifyContent: 'center', paddingVertical: 15 },
  secondaryActivityButtonText: { color: '#F4F5F8', fontSize: 12, fontWeight: '900' },
  primaryActivityButton: { alignItems: 'center', backgroundColor: '#FF7900', borderRadius: 13, flex: 1.4, justifyContent: 'center', paddingVertical: 15 },
  primaryActivityButtonActive: { backgroundColor: '#D95E00' },
  primaryActivityButtonText: { color: '#111111', fontSize: 12, fontWeight: '900' },  safety: { backgroundColor: '#21180F', borderLeftColor: '#FF7900', borderLeftWidth: 4, borderRadius: 12, marginTop: 5, padding: 14 },
  safetyTitle: { color: '#FFB35F', fontSize: 12, fontWeight: '900' },
  safetyText: { color: '#D5C3B2', fontSize: 11, lineHeight: 16, marginTop: 4 },
  requiredSafe: { flex: 1 },
  requiredContent: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 30 },
  requiredLogoFrame: { alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 54, height: 108, justifyContent: 'center', overflow: 'hidden', width: 108 },
  requiredLogo: { height: 108, width: 108 },
  requiredTitle: { color: '#FFFFFF', fontSize: 23, fontWeight: '900', marginTop: 22, textAlign: 'center' },
  requiredText: { color: '#A8A8A8', fontSize: 13, lineHeight: 19, marginTop: 8, textAlign: 'center' },
  requiredButton: { alignItems: 'center', backgroundColor: '#FF7900', borderRadius: 12, marginTop: 22, paddingHorizontal: 24, paddingVertical: 14 },
  requiredButtonText: { color: '#121212', fontSize: 13, fontWeight: '900' },
  brandIdentity: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  brandIconFrame: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 },
  brandIcon: { height: 62, width: 62 },
  brandName: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },});
