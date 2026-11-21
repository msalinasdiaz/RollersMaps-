import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

import { routeBounds, simplifyRouteForDisplay, splitRoute } from '@/lib/route-geometry';
import type { TrackingMapProps } from './tracking-map-maplibre';

// Local JSON styling and ordinary markers keep the native Maps SDK SKU free.
// Do not add googleMapId: cloud styling / advanced markers use a paid SKU.
const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#14171c' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#14171c' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#b6bdc7' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#303742' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1f252e' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#434d5a' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#10283d' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#17261c' }] },
];

export function GoogleTrackingMap({
  route, location, recenterRequest = 0, overview = false, bottomInset = 250,
}: TrackingMapProps) {
  const map = useRef<MapView>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [initialized, setInitialized] = useState(false);
  const [laidOut, setLaidOut] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const lastRecenter = useRef(-1);
  const displayRoute = useMemo(() => simplifyRouteForDisplay(route), [route]);
  const segments = useMemo(() => splitRoute(displayRoute).filter(line => line.length > 1), [displayRoute]);
  const [initialCamera] = useState(() => ({
    center: location ?? { longitude: -70.6498, latitude: -33.4324 },
    zoom: location ? 16 : 12,
    heading: 0,
    pitch: 0,
    altitude: 0,
  }));

  useEffect(() => {
    if (state !== 'loading') return;
    // The SDK has no tile-loading error event. A timeout makes retry available
    // without interrupting GPS recording or treating initialization as loaded.
    const timeout = setTimeout(() => setState('error'), 20000);
    return () => clearTimeout(timeout);
  }, [state, attempt]);

  useEffect(() => {
    if (!initialized || !laidOut || !overview || !route.length) return;
    const [west, south, east, north] = routeBounds(displayRoute);
    map.current?.fitToCoordinates([
      { latitude: south, longitude: west },
      { latitude: north, longitude: east },
    ], {
      // Android adds edge padding to mapPadding, so do not apply insets twice.
      edgePadding: { top: 0, bottom: 0, left: 0, right: 0 },
      animated: true,
    });
  }, [initialized, laidOut, overview, route, displayRoute, bottomInset]);

  useEffect(() => {
    if (!initialized || !laidOut || overview || !location) return;
    if (lastRecenter.current === recenterRequest) return;
    lastRecenter.current = recenterRequest;
    map.current?.animateCamera({ center: location, zoom: 16 }, { duration: 400 });
  }, [initialized, laidOut, overview, location, recenterRequest, bottomInset]);

  const start = route[0];
  const finish = route.at(-1);
  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        key={attempt}
        ref={map}
        provider={PROVIDER_GOOGLE}
        initialCamera={initialCamera}
        customMapStyle={darkMapStyle}
        mapPadding={{ top: overview ? 60 : 90, bottom: bottomInset + 8, left: 45, right: 45 }}
        showsCompass
        showsMyLocationButton={false}
        showsUserLocation={false}
        toolbarEnabled={false}
        moveOnMarkerPress={false}
        onLayout={({ nativeEvent }) => setLaidOut(nativeEvent.layout.width > 0 && nativeEvent.layout.height > 0)}
        onMapReady={() => setInitialized(true)}
        onMapLoaded={() => setState('ready')}
        style={StyleSheet.absoluteFill}>
        {segments.map((coordinates, index) => [
          <Polyline key={`halo-${index}`} coordinates={coordinates} strokeColor="#161616B3" strokeWidth={9} zIndex={1} />,
          <Polyline key={`route-${index}`} coordinates={coordinates} strokeColor="#FF7900" strokeWidth={5} zIndex={2} />,
        ])}
        {start ? <Marker coordinate={start} pinColor="#8DE650" title="Inicio" /> : null}
        {overview && finish ? <Marker coordinate={finish} pinColor="#FF7900" title="Fin" /> : null}
        {!overview && location ? (
          <Marker coordinate={location} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges zIndex={3}>
            <View style={styles.location}><View style={styles.center} /></View>
          </Marker>
        ) : null}
      </MapView>
      {state !== 'ready' ? (
        <View style={styles.loading} pointerEvents="box-none">
          {state === 'loading' ? <ActivityIndicator color="#FF9A45" /> : null}
          <Text style={styles.text}>{state === 'loading' ? 'Cargando mapa…' : 'El mapa no está disponible. El GPS puede seguir guardando tu recorrido.'}</Text>
          {state === 'error' ? (
            <Pressable accessibilityRole="button" style={styles.retryButton} onPress={() => {
              lastRecenter.current = -1;
              setInitialized(false);
              setLaidOut(false);
              setState('loading');
              setAttempt(value => value + 1);
            }}><Text style={styles.retry}>Reintentar mapa</Text></Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  location: { height: 38, width: 38, borderRadius: 19, backgroundColor: '#467EFF44', alignItems: 'center', justifyContent: 'center' },
  center: { height: 18, width: 18, borderRadius: 9, borderWidth: 3, borderColor: '#FFFFFF', backgroundColor: '#447BFF' },
  loading: { position: 'absolute', top: '30%', alignSelf: 'center', maxWidth: 280, backgroundColor: '#101114EE', padding: 18, borderRadius: 14, gap: 12, alignItems: 'center' },
  text: { color: '#D3D5DB', fontSize: 14, textAlign: 'center' },
  retry: { color: '#FF9A45', fontSize: 15, fontWeight: '700', padding: 10 },
  retryButton: { minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center' },
});
