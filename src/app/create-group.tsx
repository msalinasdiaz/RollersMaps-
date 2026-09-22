import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Field, Screen, ui } from '@/components/community-ui';
import { useCommunity } from '@/contexts/community';
import { supabase } from '@/lib/supabase';

export default function CreateGroup(){
  const {refresh}=useCommunity();
  const [name,setName]=useState(''),[city,setCity]=useState(''),[description,setDescription]=useState('');
  const [policy,setPolicy]=useState<'open'|'approval'>('approval');
  const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  async function save(){
    if(name.trim().length<3){setError('Escribe un nombre de al menos 3 caracteres.');return;}
    setBusy(true);setError(null);
    try{const {data,error}=await supabase.rpc('create_group',{p_name:name.trim(),p_description:description.trim(),p_city:city.trim(),p_join_policy:policy});
      if(error){setError(error.message.includes('Ya tienes una solicitud')?error.message:'No pudimos enviar la solicitud. Revisa tu conexión e inicia sesión.');return;}
      await refresh();router.replace({pathname:'/group',params:{id:data}});
    }catch{setError('No pudimos conectar. Inténtalo nuevamente.');}finally{setBusy(false);}
  }
  return <Screen back title="Crea tu comunidad" subtitle="La administración de RollersMaps revisará tu solicitud antes de habilitar el grupo.">
    <Text style={ui.muted}>Tu solicitud estará visible en Mis grupos durante 48 horas. Si no se aprueba en ese plazo, se eliminará automáticamente. Puedes tener una solicitud pendiente a la vez.</Text>
    <Field label="Nombre del grupo" value={name} onChangeText={setName} maxLength={80}/><Field label="Ciudad" value={city} onChangeText={setCity} maxLength={100}/><Field multiline label="Sobre el grupo" value={description} onChangeText={setDescription} maxLength={600}/>
    <Text style={ui.heading}>Ingreso de miembros</Text><View style={ui.row}><Button secondary={policy!=='approval'} onPress={()=>setPolicy('approval')}>Con aprobación</Button><Button secondary={policy!=='open'} onPress={()=>setPolicy('open')}>Abierto</Button></View>
    <Text style={ui.muted}>El calendario siempre queda reservado a miembros. {policy==='approval'?'Revisarás cada solicitud antes de dar acceso.':'Quienes toquen Unirme se incorporarán inmediatamente.'}</Text>
    {error?<Text accessibilityLiveRegion="polite" style={ui.accent}>{error}</Text>:null}<Button busy={busy} onPress={()=>void save()}>Solicitar creación del grupo</Button>
  </Screen>;
}
