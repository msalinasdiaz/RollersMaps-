import { useState } from 'react';
import { Alert, Keyboard, Text, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Button, Card, Field, Screen, ui } from '@/components/community-ui';
import { TrackingMap } from '@/components/tracking-map-maplibre';
import { useDemoSession } from '@/contexts/demo-session';
import { readPlans, removePlan, savePlan, type PlannedRoute } from '@/lib/planned-routes';
import { routeGpx } from '@/lib/route-gpx';
import type { RouteCoordinate } from '@/lib/route-geometry';
import { distanceBetweenMeters } from '@/lib/tracking-store';

function distance(points: RouteCoordinate[]) {
  const meters = points.reduce((total, point, i) => i ? total + distanceBetweenMeters(points[i - 1], point) : total, 0);
  return (meters / 1000).toLocaleString('es-CL', { maximumFractionDigits: 2 }) + ' km';
}

export default function MappedRoutes() {
  const { user } = useDemoSession();
  return user ? <Plans key={user.id} owner={user.id} /> : null;
}

function Plans({ owner }: { owner: string }) {
  const [initial] = useState(() => {
    try { return { plans: readPlans(owner), error: '' }; }
    catch { return { plans: [], error: 'No se pudieron leer las rutas de este teléfono.' }; }
  });
  const [plans, setPlans] = useState<PlannedRoute[]>(initial.plans);
  const [draft, setDraft] = useState<RouteCoordinate[] | null>(null);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<PlannedRoute | null>(null);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState(initial.error);

  function save() {
    if (!draft) return;
    try {
      savePlan(owner, name, draft);
      setDraft(null); setName(''); setError(''); Keyboard.dismiss();
      setPlans(readPlans(owner));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar la ruta.'); }
  }
  function confirmRemoval(plan: PlannedRoute) {
    Alert.alert('¿Eliminar ruta mapeada?', 'Se eliminará «' + plan.name + '» de este teléfono.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => {
        try { removePlan(owner, plan.id); setPlans(readPlans(owner)); setSelected(null); setError(''); }
        catch { setError('No se pudo eliminar la ruta.'); }
      } },
    ]);
  }
  async function share(plan: PlannedRoute) {
    setSharing(true); setError('');
    try {
      if (!await Sharing.isAvailableAsync()) throw new Error();
      const file = new File(Paths.cache, 'RollersMaps-' + plan.id + '.gpx');
      file.create({ overwrite: true }); file.write(routeGpx(plan.name, plan.points));
      await Sharing.shareAsync(file.uri, { mimeType: 'application/gpx+xml', UTI: 'com.topografix.gpx', dialogTitle: plan.name });
    } catch { setError('No se pudo compartir el GPX. Vuelve a intentarlo.'); }
    finally { setSharing(false); }
  }
  const points = draft ?? selected?.points;
  return <Screen back title={draft ? 'Mapear ruta' : selected ? selected.name : 'Rutas mapeadas'}>
    {error ? <Text accessibilityRole="alert" style={ui.accent}>{error}</Text> : null}
    {points ? <>
      {draft ? <Text style={ui.text}>Toca el mapa para marcar puntos en orden. Cada tramo une dos puntos en línea recta.</Text> : null}
      <View style={{ height: 340, backgroundColor: '#0c0c0c' }}>
        <TrackingMap key={selected?.id ?? 'draft'} route={points} location={null} overview={Boolean(selected)} bottomInset={12}
          onPoint={draft ? point => setDraft(previous => previous ? [...previous, point] : previous) : undefined} />
      </View>
      <Text style={ui.text}>{points.length} puntos · {distance(points)}</Text>
      {draft ? <>
        <Button secondary disabled={!points.length} onPress={() => setDraft(points.slice(0, -1))}>Deshacer último punto</Button>
        <Field label="Nombre de la ruta" value={name} maxLength={60} onChangeText={setName} />
        <Button disabled={points.length < 2 || !name.trim()} onPress={save}>Guardar ruta</Button>
        <Button secondary onPress={() => { setDraft(null); setName(''); setError(''); }}>Cancelar</Button>
      </> : selected ? <>
        <Text style={ui.muted}>El archivo GPX incluye todos los puntos de esta ruta.</Text>
        <Button busy={sharing} onPress={() => void share(selected)}>Compartir GPX</Button>
        <Button secondary onPress={() => confirmRemoval(selected)}>Eliminar ruta</Button>
        <Button secondary onPress={() => setSelected(null)}>Ver mis rutas mapeadas</Button>
      </> : null}
    </> : <>
      <Button onPress={() => { setError(''); setDraft([]); }}>Dibujar una ruta</Button>
      <Text style={ui.muted}>{plans.length ? 'Guardadas en este teléfono' : 'Tus rutas guardadas aparecerán aquí.'}</Text>
      {plans.map(plan => <Card key={plan.id}>
        <Text style={ui.heading}>{plan.name}</Text><Text style={ui.muted}>{distance(plan.points)}</Text>
        <Button secondary onPress={() => { setSelected(plan); setError(''); }}>Ver y compartir</Button>
      </Card>)}
    </>}
  </Screen>;
}
