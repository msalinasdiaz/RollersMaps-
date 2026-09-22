import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Button, Card, Field, Notice, Screen, ui } from '@/components/community-ui';
import { useCommunity } from '@/contexts/community';
import { useDemoSession } from '@/contexts/demo-session';
import { supabase } from '@/lib/supabase';
import { GroupLogo } from '@/components/group-logo';
import { GroupLogoEditor } from '@/components/group-logo-editor';

type Member={user_id:string;display_name:string;status:string;role:string};
type AdminEvent={id:string;title:string;status:string;starts_at:string;capacity:number;participants:number};
export default function GroupScreen(){
  const {id}=useLocalSearchParams<{id:string}>();
  const {groups,groupsError,isLoading,refresh}=useCommunity();
  const {isSignedIn,user}=useDemoSession();
  const group=groups.find(g=>g.id===id);
  const admin=group?.membership_status==='active'&&['owner','admin'].includes(group.membership_role??'');
  const [members,setMembers]=useState<Member[]>([]),[events,setEvents]=useState<AdminEvent[]>([]);
  const [error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false);
  const [section,setSection]=useState<'about'|'members'|'events'|'settings'>('about');
  const [name,setName]=useState(''),[city,setCity]=useState(''),[description,setDescription]=useState('');
  const [policy,setPolicy]=useState<'open'|'approval'>('approval');
  const adminRequest=useRef(0);
  const loadAdmin=useCallback(async()=>{
    const request=++adminRequest.current;
    if(!admin||!id||!user?.id){setMembers([]);setEvents([]);return;}
    const [m,a]=await Promise.all([supabase.rpc('get_group_members',{p_group_id:id}),supabase.rpc('get_group_admin_activities',{p_group_id:id})]);
    if(request!==adminRequest.current)return;
    if(m.error||a.error){setMembers([]);setEvents([]);setError('No pudimos cargar la administración del grupo.');return;}
    setMembers(m.data??[]);setEvents((a.data??[]) as AdminEvent[]);
  },[admin,id,user?.id]);
  const invalidateAdmin=useCallback(()=>{++adminRequest.current;},[]);
  useEffect(()=>{let active=true;const timer=setTimeout(()=>{if(active)void loadAdmin();},0);return()=>{active=false;invalidateAdmin();clearTimeout(timer);};},[loadAdmin,invalidateAdmin]);
  async function run(fn:()=>PromiseLike<{error:{message:string}|null}>){
    setBusy(true);setError(null);
    try{const result=await fn();if(result.error){setError(result.error.message);return;}await refresh();await loadAdmin();}
    catch{setError('No pudimos conectar. Inténtalo nuevamente.');}finally{setBusy(false);}
  }
  function leave(){Alert.alert('Salir del grupo','Se cancelarán tus inscripciones futuras y dejarás de ver su calendario. Tus recorridos personales se conservan.',[{text:'Volver',style:'cancel'},{text:'Salir del grupo',style:'destructive',onPress:()=>void run(()=>supabase.rpc('leave_group',{p_group_id:id}))}]);}
  function manage(m:Member,action:string){
    const execute=()=>void run(()=>supabase.rpc('manage_group_member',{p_group_id:id,p_user_id:m.user_id,p_action:action}));
    if(['remove','block','transfer'].includes(action))Alert.alert('Confirmar cambio',action==='transfer'?`Transferirás la propiedad a ${m.display_name}.`:`Se retirará el acceso de ${m.display_name} y se cancelarán sus reservas futuras.`,[{text:'Volver',style:'cancel'},{text:'Confirmar',onPress:execute}]);else execute();
  }
  function settings(){if(!group)return;setName(group.name);setCity(group.city);setDescription(group.description);setPolicy(group.join_policy);setSection('settings');}
  return <Screen back title={group?.name??'Grupo'} subtitle={group?.city} refresh={()=>{void refresh();void loadAdmin();}} refreshing={false}>
    {!group?<Notice title={isLoading?'Cargando grupo…':'Grupo no disponible'} text={groupsError??'Vuelve al directorio e inténtalo nuevamente.'} action="Ver grupos" onAction={()=>router.replace('/groups')}/>:group.approval_status&&group.approval_status!=='approved'?<Notice title={group.approval_status==='pending'?'Grupo pendiente de aprobación':'Solicitud rechazada'} text={(group.approval_status==='pending'?'La administración de RollersMaps revisará tu solicitud. El grupo se habilitará solo cuando se apruebe.':'Esta solicitud no fue aprobada.')+(group.approval_expires_at?' Si no se aprueba, se eliminará de tu perfil el '+new Date(group.approval_expires_at).toLocaleString('es-CL')+'.':'')} action="Ver mis grupos" onAction={()=>router.replace({pathname:'/groups',params:{view:'mine'}})}/>:<>
      {admin?<View style={ui.row}><Button secondary={section!=='about'} onPress={()=>setSection('about')}>Grupo</Button><Button secondary={section!=='members'} onPress={()=>setSection('members')}>Miembros</Button><Button secondary={section!=='events'} onPress={()=>setSection('events')}>Actividades</Button><Button secondary={section!=='settings'} onPress={settings}>Ajustes</Button></View>:null}
      {error?<Notice title="No pudimos completar la acción" text={error}/>:null}
      {section==='about'||!admin?<>
        <Card><View style={ui.row}><GroupLogo name={group.name} path={group.logo_url} size={64}/><Text style={ui.heading}>{group.name}</Text></View><Text style={ui.text}>{group.description||'Una comunidad para compartir el patinaje.'}</Text><Text style={ui.muted}>{group.member_count} miembros · {group.join_policy==='approval'?'Ingreso por aprobación':'Ingreso abierto'}</Text></Card>
        {group.membership_status==='active'?<><Button onPress={()=>router.navigate('/calendar')}>Ver calendario</Button>{group.membership_role!=='owner'?<Button secondary busy={busy} onPress={leave}>Salir del grupo</Button>:<Text style={ui.muted}>Eres el propietario. Puedes gestionar miembros, actividades y administradores.</Text>}</>:group.membership_status==='pending'?<Notice title="Solicitud pendiente" text="El grupo revisará tu solicitud. Su calendario se habilitará cuando te aprueben." action="Retirar solicitud" onAction={()=>void run(()=>supabase.rpc('leave_group',{p_group_id:id}))}/>:group.membership_status==='blocked'?<Notice title="Acceso suspendido" text="Contacta a los organizadores del grupo para revisar tu membresía."/>:<Button busy={busy} onPress={()=>isSignedIn?void run(()=>supabase.rpc('join_group',{p_group_id:id})):router.push('/auth')}>{group.join_policy==='approval'?'Solicitar ingreso':'Unirme al grupo'}</Button>}
        {group.membership_status!=='active'?<Text style={ui.muted}>El calendario, los horarios y los puntos de encuentro están reservados a miembros del grupo.</Text>:null}
      </>:null}
      {admin&&section==='members'?members.length?members.map(m=><Card key={m.user_id}><Text style={ui.heading}>{m.display_name}{m.user_id===user?.id?' · Tú':''}</Text><Text style={ui.muted}>{m.status==='pending'?'Solicitud pendiente':m.status==='blocked'?'Suspendido':m.role==='owner'?'Propietario':m.role==='admin'?'Administrador':'Miembro'}</Text><View style={ui.row}>
        {m.status==='pending'?<><Button busy={busy} onPress={()=>manage(m,'approve')}>Aprobar</Button><Button secondary disabled={busy} onPress={()=>manage(m,'reject')}>Rechazar</Button></>:null}
        {m.role!=='owner'&&m.user_id!==user?.id&&(m.role!=='admin'||group.membership_role==='owner')&&m.status==='active'?<><Button secondary disabled={busy} onPress={()=>manage(m,'remove')}>Retirar</Button><Button secondary disabled={busy} onPress={()=>manage(m,'block')}>Suspender</Button>{group.membership_role==='owner'?<><Button secondary disabled={busy} onPress={()=>manage(m,m.role==='admin'?'demote':'promote')}>{m.role==='admin'?'Quitar administración':'Hacer administrador'}</Button><Button secondary disabled={busy} onPress={()=>manage(m,'transfer')}>Transferir propiedad</Button></>:null}</>:null}
        {m.status==='blocked'?<Button secondary disabled={busy} onPress={()=>manage(m,'unblock')}>Permitir nueva solicitud</Button>:null}
      </View></Card>):<Notice title="Sin solicitudes"/>:null}
      {admin&&section==='events'?<><Button onPress={()=>router.push({pathname:'/activity-editor',params:{groupId:id}})}>Crear actividad</Button>{events.map(a=><Card key={a.id}><Text style={ui.heading}>{a.title}</Text><Text style={ui.muted}>{new Date(a.starts_at).toLocaleDateString('es-CL')} · {a.status==='published'?'Publicada':a.status==='draft'?'Borrador':'Cancelada'}</Text><Text style={ui.muted}>{Math.max(0,a.capacity-a.participants)} cupos disponibles · {a.participants} inscritos</Text><Button secondary onPress={()=>router.push({pathname:'/activity-editor',params:{groupId:id,activityId:a.id}})}>Editar actividad</Button></Card>)}</>:null}
      {admin&&section==='settings'?<><GroupLogoEditor key={group.id} group={group} onSaved={refresh}/><Field label="Nombre" value={name} onChangeText={setName} maxLength={80}/><Field label="Ciudad" value={city} onChangeText={setCity} maxLength={100}/><Field multiline label="Descripción" value={description} onChangeText={setDescription} maxLength={600}/><View style={ui.row}><Button secondary={policy!=='approval'} onPress={()=>setPolicy('approval')}>Con aprobación</Button><Button secondary={policy!=='open'} onPress={()=>setPolicy('open')}>Abierto</Button></View><Button busy={busy} onPress={()=>void run(()=>supabase.rpc('update_group',{p_group_id:id,p_name:name,p_description:description,p_city:city,p_join_policy:policy}))}>Guardar cambios</Button></>:null}
    </>}
  </Screen>;
}
