import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Field, Notice, Screen, ui } from '@/components/community-ui';
import { useCommunity } from '@/contexts/community';
import { supabase } from '@/lib/supabase';
import { activityTypeLabels, type ActivityType } from '@/data/activities';

function localDateTime(value:string){const d=new Date(value);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}
export default function ActivityEditor(){
  const {groupId,activityId}=useLocalSearchParams<{groupId:string;activityId?:string}>();
  const {groups,refresh}=useCommunity();
  const group=groups.find(g=>g.id===groupId);
  const allowed=group?.membership_status==='active'&&['admin','owner'].includes(group.membership_role??'');
  const [title,setTitle]=useState(''),[point,setPoint]=useState(''),[description,setDescription]=useState('');
  const [start,setStart]=useState(''),[end,setEnd]=useState(''),[capacity,setCapacity]=useState('30');
  const [type,setType]=useState<ActivityType>('ruta');
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(Boolean(activityId)),[error,setError]=useState<string|null>(null);
  useEffect(()=>{
    if(!activityId||!allowed)return;
    let active=true;
    void supabase.from('activities').select('title,meeting_point,description,starts_at,ends_at,capacity,activity_type').eq('id',activityId).eq('group_id',groupId).single().then(({data,error})=>{
      if(!active)return;
      if(error||!data){setError('No pudimos cargar esta actividad.');return;}
      setTitle(data.title);setPoint(data.meeting_point);setDescription(data.description??'');setStart(localDateTime(data.starts_at));setEnd(data.ends_at?localDateTime(data.ends_at):'');setCapacity(String(data.capacity));setType(data.activity_type);setLoading(false);
    });return()=>{active=false;};
  },[activityId,groupId,allowed]);
  async function save(status:'draft'|'published'|'cancelled'){
    const starts=new Date(start.replace(' ','T')),ends=new Date(end.replace(' ','T')),cap=Number(capacity);
    if(title.trim().length<3||point.trim().length<3||!Number.isFinite(starts.getTime())||!Number.isFinite(ends.getTime())||ends<=starts||!Number.isInteger(cap)||cap<1||cap>500){setError('Revisa nombre, punto de encuentro, fechas (AAAA-MM-DD HH:mm) y cupos (1 a 500).');return;}
    setBusy(true);setError(null);
    const payload={group_id:groupId,title:title.trim(),meeting_point:point.trim(),description:description.trim(),starts_at:starts.toISOString(),ends_at:ends.toISOString(),capacity:cap,activity_type:type,status,helmet_required:true};
    try{const result=activityId?await supabase.from('activities').update(payload).eq('id',activityId).eq('group_id',groupId).select('id').single():await supabase.from('activities').insert(payload).select('id').single();
      if(result.error){setError(result.error.message);return;}await refresh();router.back();
    }catch{setError('No pudimos guardar. Revisa tu conexión.');}finally{setBusy(false);}
  }
  return <Screen back title={activityId?'Editar actividad':'Nueva actividad'} subtitle={group?.name}>
    {!allowed?<Notice title="Acceso reservado a administradores"/>:<>
      {error?<Notice title="Revisa la actividad" text={error}/>:null}
      <Field label="Nombre" value={title} onChangeText={setTitle} maxLength={90}/><View style={ui.row}>{(Object.keys(activityTypeLabels) as ActivityType[]).map(t=><Button key={t} secondary={type!==t} onPress={()=>setType(t)}>{activityTypeLabels[t]}</Button>)}</View>
      <Field label="Inicio · AAAA-MM-DD HH:mm" placeholder="2026-10-10 19:30" value={start} onChangeText={setStart}/><Field label="Término · AAAA-MM-DD HH:mm" placeholder="2026-10-10 21:00" value={end} onChangeText={setEnd}/><Text style={ui.muted}>Horario local de este dispositivo. Se guardará con su zona horaria.</Text>
      <Field label="Punto de encuentro" value={point} onChangeText={setPoint} maxLength={120}/><Field label="Cupos" value={capacity} onChangeText={setCapacity} keyboardType="number-pad"/><Field multiline label="Indicaciones" value={description} onChangeText={setDescription} maxLength={600}/>
      <Button busy={busy} disabled={loading} onPress={()=>void save('published')}>Publicar actividad</Button><Button secondary disabled={busy||loading} onPress={()=>void save('draft')}>Guardar borrador</Button>{activityId?<Button secondary disabled={busy||loading} onPress={()=>void save('cancelled')}>Cancelar actividad</Button>:null}
    </>}
  </Screen>;
}
