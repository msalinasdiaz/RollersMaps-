import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useDemoSession } from '@/contexts/demo-session';
import { parseRouteGeometry, type RouteCoordinate } from '@/lib/route-geometry';
import { supabase } from '@/lib/supabase';
import { getLegacyActivityCount, getLocalActivities, GUEST_OWNER, recoverGuestActivities, renameLocalActivity } from '@/lib/tracking-store';
import { syncLocalActivities } from '@/lib/local-sync';

export type UserActivity = {
  activityType: 'group_activity' | 'free_route' | 'guided_route'; averageSpeedKmh: number;
  distanceKm: number; durationSeconds: number; endedAt: Date; groupActivityId: string | null;
  id: string; localId?: string; cloudId?: string | null; route: RouteCoordinate[];
  startedAt: Date; syncStatus: 'not_connected' | 'pending' | 'synced' | 'error'; title: string;
};
type Row = { id:string; title:string; activity_type:UserActivity['activityType']; group_activity_id:string|null;
  average_speed_kmh:number; distance_km:number; duration_seconds:number; ended_at:string; started_at:string; route_geojson:unknown };
export function useUserActivities(enabled=true) {
  const { user, recordedActivityVersion, notifyRecordedActivitySaved }=useDemoSession();
  const owner=user?.id??GUEST_OWNER;
  const request=useRef(0);
  const [state,setState]=useState({ owner:'',activities:[] as UserActivity[],error:null as string|null,isLoading:true });
  const loadActivities=useCallback(async()=>{
    const sequence=++request.current;
    if (owner === GUEST_OWNER) { setState({owner,activities:[],error:null,isLoading:false}); return; }
    const local=getLocalActivities(owner).map(({snapshot:s,cloudId}):UserActivity=>({
      activityType:s.activityType,averageSpeedKmh:s.averageSpeedKmh,distanceKm:s.distanceKm,durationSeconds:s.durationSeconds,
      endedAt:new Date(s.endedAt??s.startedAt),groupActivityId:s.groupActivityId,id:cloudId??'local:'+s.recordId,localId:s.recordId,cloudId,
      route:s.route,startedAt:new Date(s.startedAt),syncStatus:cloudId?'synced':'pending',title:s.title,
    }));
    setState({owner,activities:local,error:null,isLoading:owner!==GUEST_OWNER&&local.length===0});
    try {
      const {data,error}=await supabase.from('user_activities').select('id,title,activity_type,group_activity_id,started_at,ended_at,duration_seconds,distance_km,average_speed_kmh,route_geojson').eq('user_id',owner).order('started_at',{ascending:false}).limit(100);
      if(sequence!==request.current)return;
      const cloud=((data??[]) as Row[]).map((a):UserActivity=>({activityType:a.activity_type,averageSpeedKmh:Number(a.average_speed_kmh),distanceKm:Number(a.distance_km),durationSeconds:a.duration_seconds,endedAt:new Date(a.ended_at),groupActivityId:a.group_activity_id,id:a.id,cloudId:a.id,route:parseRouteGeometry(a.route_geojson),startedAt:new Date(a.started_at),syncStatus:'synced',title:a.title}));
      const merged=new Map(local.map(a=>[a.id,a]));
      cloud.forEach(a=>merged.set(a.id,{...a,localId:merged.get(a.id)?.localId}));
      setState({owner,activities:[...merged.values()].sort((a,b)=>b.startedAt.getTime()-a.startedAt.getTime()),error:error?'No pudimos cargar el respaldo en la nube. Tus recorridos locales siguen disponibles.':null,isLoading:false});
    }catch {if(sequence===request.current)setState({owner,activities:local,error:'Sin conexión con tu respaldo. Tus recorridos locales siguen disponibles.',isLoading:false});}
  },[owner]);
  useFocusEffect(useCallback(()=>{void recordedActivityVersion;if(enabled)void loadActivities();return()=>{++request.current;};},[enabled,loadActivities,recordedActivityVersion]));
  const renameActivity=useCallback(async(id:string,title:string)=>{
    const clean=title.trim();if(clean.length<3||clean.length>60)return 'Usa entre 3 y 60 caracteres.';
    const activity=state.owner===owner?state.activities.find(a=>a.id===id):undefined;
    if(!activity)return 'El recorrido no está disponible.';
    if(activity.cloudId){
      if(!user)return 'Inicia sesión para renombrar un recorrido de tu cuenta.';
      const {error}=await supabase.from('user_activities').update({title:clean}).eq('id',activity.cloudId).eq('user_id',owner);
      if(error)return 'No pudimos actualizar el nombre. Revisa tu conexión.';
    }
    if(activity.localId)renameLocalActivity(activity.localId,owner,clean);
    notifyRecordedActivitySaved();await loadActivities();return null;
  },[state,owner,user,notifyRecordedActivitySaved,loadActivities]);
  const sync=useCallback(async()=>{
    if(!user)return 'Inicia sesión para respaldar tus recorridos.';
    try {const error=await syncLocalActivities(user.id);notifyRecordedActivitySaved();await loadActivities();return error;}
    catch {return 'No pudimos respaldar. Tus recorridos siguen en este teléfono.';}
  },[user,notifyRecordedActivitySaved,loadActivities]);
  const legacyCount = useMemo(() => {
    void recordedActivityVersion;
    return user ? getLegacyActivityCount() : 0;
  }, [user, recordedActivityVersion]);
  const recoverLegacy = useCallback(() => {
    if (!user) return;
    recoverGuestActivities(user.id);
    notifyRecordedActivitySaved();
  }, [user, notifyRecordedActivitySaved]);
  const visible=state.owner===owner?state:{activities:[],error:null,isLoading:true};
  return {...visible,legacyCount,recoverLegacy,refresh:loadActivities,renameActivity,sync};
}
