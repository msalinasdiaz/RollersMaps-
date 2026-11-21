import * as Location from 'expo-location';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InlineSkateIcon } from '@/components/inline-skate-icon';
import { TrackingMap } from '@/components/tracking-map';
import { maximumSpeedKmh, formatMaximumSpeed } from '@/lib/maximum-speed';
import { syncTrackingLiveActivity, endTrackingLiveActivity } from '@/lib/tracking-live-activity';
import { currentSpeedKmh, formatTrackingTime } from '@/lib/tracking-metrics';
import { simplifyRouteForDisplay } from '@/lib/route-geometry';
import { GpsTargetIcon } from '@/components/gps-target-icon';
import { useDemoSession } from '@/contexts/demo-session';
import { activityTypeLabels, getActivityTiming } from '@/data/activities';
import { useActivities } from '@/hooks/use-activities';
import { syncLocalActivities } from '@/lib/local-sync';
import {
  archiveTrackingSession,
  clearLocalTrackingSession,
  pauseLocalTrackingSession,
  resumeLocalTrackingSession,
  setTrackingTitle,
  flushLocationQueue,
  getTrackingSnapshot,
  isFreshTrackingLocation,
  markTrackingPendingSave,
  startLocalTrackingSession,
  type TrackingSnapshot,
} from '@/lib/tracking-store';
import {
  isLocationServiceCancellation,
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

const locationTimeoutMs = 12_000;
const freeOption: TrackingOption = { groupActivityId: null, id: 'free', kind: 'free', meta: 'Salida personal', title: 'Ruta libre' };

export default function TrackScreen() {
  const { user } = useDemoSession();
  if (!user) return <Redirect href="/welcome" />;
  return <Tracker key={user.id} ownerId={user.id} />;
}

function Tracker({ ownerId }: { ownerId: string }) {
  const params = useLocalSearchParams<{ activityId?: string; view?: string }>();
  const requestedMap = params.view === 'map';
  const requestedActivityId = Array.isArray(params.activityId) ? params.activityId[0] : params.activityId;
  const { isJoined, notifyRecordedActivitySaved } = useDemoSession();
  const { activities, isLoading: activitiesLoading } = useActivities(true);
  const [userLocation, setUserLocation] = useState<MapCoordinate | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [snapshot, setSnapshot] = useState<TrackingSnapshot | null>(null);
  const [viewMode,setViewMode]=useState<'stats'|'map'>('map');
  const [reviewing,setReviewing]=useState(false);
  const [draftTitle,setDraftTitle]=useState('');
  const actionRef=useRef(false);
  const [message, setMessage] = useState('Toca Iniciar recorrido para preparar el GPS.');
  const [referenceTime, setReferenceTime] = useState(() => new Date());
  const [recenterRequest, setRecenterRequest] = useState(0);
  const locationRequestRef = useRef(false);
  const screenMountedRef = useRef(true);
  const disclosureAcceptedRef = useRef(false);
  const cancelLocationWatchRef = useRef<(() => void) | null>(null);

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
  const isPaused = snapshot?.status === 'paused';
  const isPendingSave = snapshot?.status === 'pending_save';
  const isEventLocked = Boolean(!snapshot && requestedActivity && !timing?.canStart);
  const eventHasEnded = Boolean(requestedActivity && timing?.hasEnded);
  const displayedSnapshot = snapshot;
  const elapsedSeconds = displayedSnapshot?.durationSeconds ?? 0;
  const distanceKm = displayedSnapshot?.distanceKm ?? 0;
  const averageSpeed = displayedSnapshot?.averageSpeedKmh ?? 0;
  const storedRoute = displayedSnapshot?.route;
  const trackedRoute = useMemo(
    () => storedRoute ?? [],
    [storedRoute],
  );
  const maximumSpeed = useMemo(() => maximumSpeedKmh(trackedRoute), [trackedRoute]);
  const showMap = viewMode==='map'||reviewing||isPendingSave;
  const displayRoute = useMemo(()=>showMap?simplifyRouteForDisplay(trackedRoute):[],[showMap,trackedRoute]);
  const displayTitle = displayedSnapshot?.title ?? selectedOption.title;

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
      void syncTrackingLiveActivity();
      const lastPoint = localSnapshot?.route.at(-1);
      if (lastPoint) setUserLocation(current=>current?.latitude===lastPoint.latitude && current.longitude===lastPoint.longitude?current:{ latitude: lastPoint.latitude, longitude: lastPoint.longitude });
    };

    const restoreTracking = async () => {
      const localSnapshot = getTrackingSnapshot(ownerId);
      if (!isMounted || !localSnapshot) return;
      setSnapshot(localSnapshot);
      void syncTrackingLiveActivity();
      const lastPoint = localSnapshot.route.at(-1);
      if (lastPoint) {
        setUserLocation({ latitude: lastPoint.latitude, longitude: lastPoint.longitude });
        setRecenterRequest((current) => current + 1);
      }
      if (localSnapshot.status === 'active') {
        setViewMode(requestedMap ? 'map' : 'stats');
        try {
          await startActiveLocationService(ownerId);
          if (isMounted) void syncTrackingLiveActivity({ allowStart: true, force: true });
          if (isMounted) setMessage('Recuperamos tu ruta. El GPS sigue registrando en segundo plano.');
        } catch (error) {
          if (isLocationServiceCancellation(error)) { if (isMounted) setSnapshot(getTrackingSnapshot(ownerId)); return; }
          try { await flushLocationQueue(); } finally { pauseLocalTrackingSession(ownerId); }
          if (isMounted) { setSnapshot(getTrackingSnapshot(ownerId)); setMessage('Recuperamos tu ruta en pausa. Revisa el permiso de ubicación y reanuda.'); }
        }
      } else if (localSnapshot.status === 'paused' && isMounted) {
        setViewMode(requestedMap ? 'map' : 'stats');setMessage('Tu recorrido sigue en pausa. Reanuda cuando quieras continuar.');
      } else if (isMounted) {
        setDraftTitle(localSnapshot.title);
        setMessage('Tu recorrido está seguro en este teléfono. Toca Guardar para finalizar.');
      }
    };

    void restoreTracking().catch(()=>{if(isMounted)setMessage('No pudimos recuperar el GPS. Tu recorrido sigue en este teléfono.');});
    const interval = setInterval(refreshLocalTracking, 1000);
    return () => { isMounted = false; screenMountedRef.current = false; cancelLocationWatchRef.current?.(); clearInterval(interval); };
  }, [ownerId, requestedMap]);

  const getDeviceLocation = useCallback(async (): Promise<Location.LocationObject | null> => {
    if (locationRequestRef.current) return null;
    locationRequestRef.current = true;
    setIsLocating(true);
    setMessage('Buscando tu ubicación…');
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted') permission = await Location.requestForegroundPermissionsAsync();
      if (!screenMountedRef.current) return null;
      if (permission.status !== 'granted') {
        setMessage('Necesitamos acceso a tu ubicación mientras ocupas la ruta.');
        if (!permission.canAskAgain) Alert.alert('Activa la ubicación','Abre los ajustes de RollersMaps y permite el acceso a tu ubicación precisa.',[{text:'Ahora no',style:'cancel'},{text:'Abrir ajustes',onPress:()=>{void Linking.openSettings();}}]);
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
      if (!screenMountedRef.current) return null;
      if (lastKnown) setUserLocation({ latitude: lastKnown.coords.latitude, longitude: lastKnown.coords.longitude });
      const current = await new Promise<Location.LocationObject | null>((resolve)=>{
        let subscription:Location.LocationSubscription|null=null,settled=false;
        const finish=(value:Location.LocationObject|null)=>{if(settled)return;settled=true;clearTimeout(timeout);subscription?.remove();cancelLocationWatchRef.current=null;resolve(value);};
        const timeout=setTimeout(()=>finish(null),locationTimeoutMs);
        cancelLocationWatchRef.current=()=>finish(null);
        void Location.watchPositionAsync({accuracy:Location.Accuracy.High,timeInterval:1000,distanceInterval:0},location=>{
          if (!screenMountedRef.current) { finish(null);return; }
          if(isFreshTrackingLocation(location))finish(location);
        },()=>finish(null)).then(watch=>{subscription=watch;if(settled)watch.remove();}).catch(()=>finish(null));
      });
      const location = current ?? (lastKnown && isFreshTrackingLocation(lastKnown) ? lastKnown : null);
      if (!location) { setMessage('Necesitamos una ubicación reciente y precisa. Acércate a un lugar abierto e inténtalo de nuevo.'); return null; }
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

  const explainTracking = useCallback(async()=>{
    if(disclosureAcceptedRef.current)return true;
    const accepted=await new Promise<boolean>(resolve=>Alert.alert('Antes de iniciar el GPS',
      'RollersMaps recopila datos de ubicación para registrar tu recorrido GPS mientras mantienes la grabación activa, incluso con la pantalla apagada o la app en segundo plano.',
      [{text:'Ahora no',style:'cancel',onPress:()=>resolve(false)},{text:'Continuar',onPress:()=>resolve(true)}],{cancelable:false}));
    disclosureAcceptedRef.current=accepted;return accepted;
  },[]);

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
        Platform.OS==='ios'?'Para mantener el recorrido con la pantalla apagada, permite la ubicación “Siempre” y activa “Ubicación precisa” en los ajustes de RollersMaps.':'Para mantener el recorrido con la pantalla apagada, elige “Permitir todo el tiempo” y activa la ubicación precisa en el siguiente paso.',
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
      Alert.alert('Falta un permiso', Platform.OS==='ios'?'En Ajustes, permite la ubicación “Siempre”. Si elegiste “Permitir una vez”, debes cambiarla allí para registrar con la pantalla apagada.':'En los ajustes de RollersMaps, permite la ubicación “Todo el tiempo” para continuar al apagar la pantalla.',
        [{text:'Ahora no',style:'cancel'},{text:'Abrir ajustes',onPress:()=>{void Linking.openSettings();}}]);
      return false;
    }
    return true;
  }, []);

  const runAction = async (action: () => Promise<void>) => {
    if (actionRef.current) return;
    actionRef.current=true;setIsSaving(true);
    try { await action(); }
    catch(error) { setMessage(error instanceof Error ? error.message : 'No pudimos completar la acción. Tu recorrido sigue en este teléfono.'); }
    finally {actionRef.current=false;setIsSaving(false);}
  };
  const pause = () => runAction(async()=>{
    try { await stopActiveLocationService({ keepLiveActivity: true }); } catch { /* Persisting the pause also rejects late points. */ }
    try { await flushLocationQueue(); } finally { pauseLocalTrackingSession(ownerId);setSnapshot(getTrackingSnapshot(ownerId)); }
    setSnapshot(getTrackingSnapshot(ownerId));setMessage('En pausa. El tiempo y la distancia están detenidos.');
    void syncTrackingLiveActivity({ force: true });
  });
  const startOrResume = () => runAction(async()=>{
    if(isEventLocked)return;
    if(!await explainTracking())return;
    if(isPaused)await flushLocationQueue();
    const location=await getDeviceLocation();
    if(!location || !await ensureBackgroundPermission() || !screenMountedRef.current)return;
    if(isPaused) resumeLocalTrackingSession(ownerId,location);
    else startLocalTrackingSession({activityType:selectedOption.kind==='group'?'group_activity':'free_route',groupActivityId:selectedOption.groupActivityId,initialLocation:location,title:selectedOption.kind==='group'?selectedOption.title:'Patinaje en línea',userId:ownerId});
    setSnapshot(getTrackingSnapshot(ownerId));setViewMode('stats');
    try{
      await startActiveLocationService(ownerId);
      void syncTrackingLiveActivity({ allowStart: true, force: true });
      setMessage('GPS activo. El recorrido continúa con la pantalla apagada.');
    }catch(error){
      if (isLocationServiceCancellation(error)) { if (screenMountedRef.current) setSnapshot(getTrackingSnapshot(ownerId)); return; }
      try { await flushLocationQueue(); } finally { pauseLocalTrackingSession(ownerId);setSnapshot(getTrackingSnapshot(ownerId)); }
      setMessage('Dejamos el recorrido en pausa. Revisa los permisos y reanuda.');
    }
  });
  const review = () => {
    if(!snapshot || isTracking || isSaving)return;
    setDraftTitle(snapshot.title);setReviewing(true);
  };
  const save = () => runAction(async()=>{
    await flushLocationQueue();
    setTrackingTitle(ownerId,draftTitle);
    if(!isPendingSave)markTrackingPendingSave();
    const final=getTrackingSnapshot(ownerId);
    if(!final)return;
    setSnapshot(final);
    archiveTrackingSession(final);
    void endTrackingLiveActivity();
    notifyRecordedActivitySaved();
    void syncLocalActivities(ownerId).then(()=>notifyRecordedActivitySaved()).catch(()=>undefined);
    router.replace({pathname:'/my-activities',params:{saved:final.recordId}});
  });
  const discard = () => Alert.alert('Descartar recorrido','Se eliminará únicamente este recorrido sin guardar.',[
    {text:'Volver',style:'cancel'},
    {text:'Descartar',style:'destructive',onPress:()=>void runAction(async()=>{
      if(getTrackingSnapshot(ownerId)?.userId!==ownerId)return;
      try{await stopActiveLocationService();}catch{}
      await flushLocationQueue();clearLocalTrackingSession();router.back();
    })},
  ]);
  const goBack = () => router.back();
  const completedReview=reviewing||isPendingSave;
  const busy=isSaving||isLocating;
  const currentSpeed=currentSpeedKmh(snapshot);
  const visibleMessage=snapshot?.trackingError??(isTracking && (snapshot?.gpsStatus==='interrupted'||snapshot?.gpsStatus==='acquiring')?'La señal GPS se interrumpió. Estamos buscando posiciones precisas; el tramo sin señal queda fuera de la distancia y del tiempo registrado.':message);
  if(requestedActivityId&&activitiesLoading&&!snapshot)return <LoadingScreen/>;
  if(requestedActivityId&&!requestedActivity&&!snapshot)return <View style={styles.required}><Text style={styles.body}>Esta actividad no está disponible para tu cuenta.</Text><Pressable onPress={()=>router.replace('/track')}><Text style={styles.link}>Patinar libre</Text></Pressable></View>;
  return <View style={styles.screen}>
    <StatusBar style={isPaused&&!completedReview?'dark':'light'}/>
    {showMap?<TrackingMap route={displayRoute} location={userLocation} recenterRequest={recenterRequest} overview={completedReview} bottomInset={completedReview?360:290}/>:null}
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{flex:1}} pointerEvents="box-none">
    <SafeAreaView edges={['top','bottom']} style={styles.overlay} pointerEvents="box-none">
      <View style={[styles.header,isPaused&&!completedReview&&styles.pausedHeader]}>
        <View style={styles.topRow}>
          <Pressable accessibilityRole="button" accessibilityLabel={completedReview?'Volver al recorrido':'Volver'} onPress={completedReview?()=>setReviewing(false):goBack} disabled={busy||isPendingSave} style={styles.smallButton}>
            <Text style={[styles.link,isPaused&&!completedReview&&styles.darkText]}>{completedReview?'Volver':'‹ Volver'}</Text>
          </Pressable>
          <View style={styles.sport}><InlineSkateIcon size={23} color={isPaused&&!completedReview?'#161616':'#FF9A45'}/><Text style={[styles.sportText,isPaused&&!completedReview&&styles.darkText]}>Patinaje en línea</Text></View>
          {!completedReview?<Pressable accessibilityRole="button" onPress={()=>setViewMode(showMap?'stats':'map')} style={styles.smallButton}><Text style={[styles.link,isPaused&&styles.darkText]}>{showMap?'Datos':'Mapa'}</Text></Pressable>:<View style={{width:50}}/>}
        </View>
        <Text style={[styles.status,isPaused&&!completedReview&&styles.darkText]}>{completedReview?'RESUMEN DEL RECORRIDO':isPaused?'EN PAUSA':isTracking?'EN CURSO':'LISTO PARA PATINAR'}</Text>
        {!completedReview?<Text style={[styles.timer,isPaused&&styles.darkText]}>{formatTrackingTime(elapsedSeconds)}</Text>:null}
      </View>
      {completedReview?<View style={styles.reviewDock}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:16}} style={{maxHeight:240}}>
          <Text style={styles.reviewTitle}>Guardar actividad</Text>
          <TextInput accessibilityLabel="Nombre del recorrido" value={draftTitle} onChangeText={setDraftTitle} maxLength={60} style={styles.titleInput}/>
          <View style={styles.compactStats}><Metric label="Distancia · km" value={formatDistance(distanceKm)}/><Metric label="Tiempo activo" value={formatTrackingTime(elapsedSeconds)}/><Metric label="Media · km/h" value={formatDecimal(averageSpeed)}/><Metric label="Máxima · km/h" value={formatMaximumSpeed(maximumSpeed)}/></View>
          <Text style={styles.body}>El tiempo en pausa queda fuera del resumen. Tu recorrido se guarda aunque no tengas conexión.</Text>
          <Text accessibilityLiveRegion="polite" style={styles.message}>{visibleMessage}</Text>
        </ScrollView>
        <View style={styles.actions}><ActionButton label={busy?'Guardando…':'Guardar actividad'} disabled={busy} onPress={()=>void save()}/></View>
        <Pressable accessibilityRole="button" disabled={busy} onPress={discard} style={styles.discard}><Text style={styles.muted}>Descartar recorrido</Text></Pressable>
      </View>:<>
        {!showMap?<View style={styles.largeStats}>
          <BigMetric label={isPaused?'Velocidad media · km/h':'Velocidad · km/h'} value={formatDecimal(isPaused?averageSpeed:currentSpeed)}/>
          <BigMetric label="Distancia · km" value={formatDistance(distanceKm)}/>
          <View style={styles.compactStats}><Metric label="Media · km/h" value={formatDecimal(averageSpeed)}/><Metric label="Máxima · km/h" value={formatMaximumSpeed(maximumSpeed)}/></View>
        </View>:<View style={{flex:1}} pointerEvents="none"/>}
        <View style={styles.bottomDock}>
          {showMap?<View style={styles.mapStats}>
            <Text style={styles.activityTitle} numberOfLines={1}>{displayTitle}</Text>
            <View style={styles.compactStats}><Metric label="Velocidad · km/h" value={formatDecimal(currentSpeed)}/><Metric label="Distancia · km" value={formatDistance(distanceKm)}/><Metric label="Media · km/h" value={formatDecimal(averageSpeed)}/><Metric label="Máxima · km/h" value={formatMaximumSpeed(maximumSpeed)}/></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Centrar en mi ubicación" onPress={()=>void getDeviceLocation()} disabled={busy} style={styles.recenter}><GpsTargetIcon size={20}/><Text style={styles.link}>Centrar mapa</Text></Pressable>
          </View>:null}
          <Text accessibilityLiveRegion="polite" style={styles.message}>{eventHasEnded&&!snapshot?'Esta actividad ya finalizó.':isEventLocked&&requestedActivity?'El registro se habilita a las '+requestedActivity.time+'.':visibleMessage}</Text>
          <View style={styles.actions}>
            {isTracking?<ActionButton label={busy?'Pausando…':'Ⅱ  Pausar'} disabled={busy} onPress={()=>void pause()}/>:isPaused?<>
              <ActionButton label={busy?'Preparando…':'▶  Reanudar'} disabled={busy} onPress={()=>void startOrResume()}/>
              <ActionButton label="⚑  Finalizar" secondary disabled={busy} onPress={review}/>
            </>:<ActionButton label={busy?'Preparando GPS…':'▶  Iniciar recorrido'} disabled={busy||isEventLocked} onPress={()=>void startOrResume()}/>}
          </View>
          {!isTracking&&!isPaused?<Text style={styles.hint}>El GPS comienza cuando tocas Iniciar recorrido.</Text>:null}
        </View>
      </>}
    </SafeAreaView>
    </KeyboardAvoidingView>
  </View>;
}

function ActionButton({label,onPress,disabled=false,secondary=false}:{label:string;onPress:()=>void;disabled?:boolean;secondary?:boolean}){
  return <Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={[styles.action,secondary&&styles.secondaryAction,disabled&&{opacity:.5}]}><Text style={[styles.actionText,secondary&&styles.darkText]}>{label}</Text></Pressable>;
}
function Metric({label,value}:{label:string;value:string}){return <View style={styles.metric}><Text adjustsFontSizeToFit numberOfLines={1} style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;}
function BigMetric({label,value}:{label:string;value:string}){return <View style={styles.bigMetric}><Text adjustsFontSizeToFit numberOfLines={1} style={styles.bigValue}>{value}</Text><Text style={styles.bigLabel}>{label}</Text></View>;}
function LoadingScreen(){return <View style={styles.required}><ActivityIndicator color="#FF9A45"/><Text style={styles.body}>Preparando tu actividad…</Text></View>;}
function formatDecimal(value:number){return value.toFixed(1).replace('.',',');}
function formatDistance(value:number){return value.toFixed(2).replace('.',',');}
const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:'#101010'},overlay:{flex:1,justifyContent:'space-between'},
  header:{backgroundColor:'#101010EE',paddingHorizontal:16,paddingTop:4,paddingBottom:16},
  pausedHeader:{backgroundColor:'#FFD044'},topRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
  smallButton:{minHeight:48,minWidth:50,justifyContent:'center'},link:{color:'#FF9A45',fontSize:14,fontWeight:'700'},
  sport:{flexDirection:'row',alignItems:'center',gap:7,flexShrink:1},sportText:{color:'#F6F6F6',fontSize:13,fontWeight:'700'},
  status:{color:'#B3B3BB',fontSize:12,fontWeight:'800',textAlign:'center',letterSpacing:1,marginTop:7},
  timer:{color:'#FFFFFF',fontSize:42,fontWeight:'800',fontVariant:['tabular-nums'],textAlign:'center',marginTop:4},
  darkText:{color:'#151515'},largeStats:{flex:1,justifyContent:'space-evenly',paddingHorizontal:28,minHeight:200},
  bigMetric:{alignItems:'center'},bigValue:{color:'#FFFFFF',fontSize:92,fontWeight:'800',fontVariant:['tabular-nums'],letterSpacing:-3},
  bigLabel:{color:'#B8B8C1',fontSize:15,marginTop:1},bottomDock:{backgroundColor:'#101010F5',paddingHorizontal:18,paddingBottom:10,paddingTop:12,gap:14},
  actions:{flexDirection:'row',gap:12},action:{flex:1,backgroundColor:'#FF7900',borderRadius:32,minHeight:56,alignItems:'center',justifyContent:'center',paddingHorizontal:16,paddingVertical:14},
  secondaryAction:{backgroundColor:'#FFFFFF'},actionText:{color:'#101010',fontSize:17,fontWeight:'800',textAlign:'center'},
  hint:{color:'#8E8E99',fontSize:12,textAlign:'center'},message:{color:'#B9BAC3',fontSize:13,lineHeight:18,textAlign:'center'},
  mapStats:{gap:12},activityTitle:{color:'#FFFFFF',fontSize:16,fontWeight:'700',textAlign:'center'},
  compactStats:{flexDirection:'row',gap:6},metric:{flex:1,alignItems:'center'},metricValue:{color:'#FFFFFF',fontSize:22,fontWeight:'800',fontVariant:['tabular-nums']},
  metricLabel:{color:'#A6A6B0',fontSize:13,textAlign:'center',marginTop:4},recenter:{alignSelf:'center',flexDirection:'row',alignItems:'center',gap:8,minHeight:48},
  reviewDock:{backgroundColor:'#141414',borderTopLeftRadius:24,borderTopRightRadius:24,padding:22,gap:16},
  reviewTitle:{color:'#FFFFFF',fontSize:23,fontWeight:'800'},titleInput:{color:'#FFFFFF',borderColor:'#4B4B55',borderWidth:1,borderRadius:10,padding:12,fontSize:16},
  body:{color:'#B5B5BE',fontSize:14,lineHeight:20},muted:{color:'#A8A8B0',fontSize:14},discard:{alignItems:'center',padding:6,minHeight:48},
  required:{flex:1,backgroundColor:'#101010',alignItems:'center',justifyContent:'center',padding:24,gap:20},
});
