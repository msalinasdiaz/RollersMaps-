import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Button, Card, Notice, Screen, ui } from '@/components/community-ui';
import { useCommunity } from '@/contexts/community';
import { useDemoSession } from '@/contexts/demo-session';
import { getActivityTiming } from '@/data/activities';

export default function Calendar(){
  const {groups,activities,isLoading,calendarError,groupsError,refresh}=useCommunity();
  const {isSignedIn,isJoined,toggleActivity}=useDemoSession();
  const [filter,setFilter]=useState<string|null>(null),[busy,setBusy]=useState<string|null>(null);
  const [now,setNow]=useState(()=>new Date());
  useEffect(()=>{const timer=setInterval(()=>setNow(new Date()),30000);return()=>clearInterval(timer);},[]);
  const own=groups.filter(g=>g.membership_status==='active');
  const selected=own.some(g=>g.id===filter)?filter:null;
  const shown=activities.filter(a=>(!selected||a.groupId===selected)&&!getActivityTiming(a,now).hasEnded);
  async function toggle(id:string){setBusy(id);try{await toggleActivity(id);}finally{setBusy(null);}}
  return <Screen title="Calendario" subtitle="Las próximas actividades de tus grupos." refresh={()=>void refresh()} refreshing={isLoading&&activities.length>0}>
    {!isSignedIn?<Notice title="Tu calendario comienza con una comunidad" text="Ingresa y únete a un grupo para ver sus actividades." action="Ingresar" onAction={()=>router.push('/auth')}/>:isLoading&&!groups.length?<ActivityIndicator color="#FF9A45"/>:calendarError||groupsError?<Notice title="No pudimos cargar el calendario" text="Revisa tu conexión. Puedes seguir patinando libremente." action="Reintentar" onAction={()=>void refresh()}/>:!own.length?<Notice title="Únete a tu primer grupo" text="Si ya enviaste una solicitud, el calendario se habilitará cuando te aprueben." action="Descubrir grupos" onAction={()=>router.navigate('/groups')}/>:<>
      {own.length>1?<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8}}>{[{id:null,name:'Todos'},...own].map(g=><Pressable key={g.id??'all'} accessibilityRole="tab" accessibilityState={{selected:g.id===selected}} onPress={()=>setFilter(g.id)} style={[ui.button,g.id!==selected&&ui.secondary]}><Text style={[ui.buttonText,g.id!==selected&&ui.secondaryText]}>{g.name}</Text></Pressable>)}</ScrollView>:null}
      {!shown.length?<Notice title="Sin actividades próximas" text="Cuando tus grupos publiquen una salida, aparecerá aquí."/>:shown.map(a=>{
        const joined=isJoined(a.id),timing=getActivityTiming(a,now),remaining=Math.max(0,a.capacity-a.participants);
        return <Card key={a.id}><Text style={ui.accent}>{a.groupName}</Text><Text style={ui.heading}>{a.title}</Text><Text style={ui.text}>{a.date.toLocaleDateString('es-CL',{weekday:'long',day:'numeric',month:'long'})} · {a.time}</Text><Text style={ui.muted}>{a.meetingPoint}</Text>{a.level?<Text style={ui.muted}>{a.level}{a.difficulty?` · ${a.difficulty}`:''}</Text>:null}{a.note?<Text style={ui.muted}>{a.note}</Text>:null}<Text style={ui.muted}>{joined?'Tu cupo está confirmado':`${remaining} cupos disponibles`}</Text>
          {joined&&timing.canStart?<Button onPress={()=>router.push({pathname:'/track',params:{activityId:a.id}})}>Registrar esta salida</Button>:null}
          <View><Button secondary={joined} disabled={busy!==null||(timing.hasStarted&&!joined)||(!joined&&!remaining)} busy={busy===a.id} onPress={()=>void toggle(a.id)}>{joined?'Cancelar inscripción':timing.hasStarted?'Actividad en curso':remaining?'Inscribirme':'Sin cupos'}</Button></View>
        </Card>;
      })}
    </>}
  </Screen>;
}
