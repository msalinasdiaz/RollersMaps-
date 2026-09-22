import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Button, Card, Field, Notice, Screen, ui } from '@/components/community-ui';
import { GroupLogo } from '@/components/group-logo';
import { useCommunity } from '@/contexts/community';
import { useDemoSession } from '@/contexts/demo-session';

export default function GroupsScreen(){
  const {groups,isLoading,groupsError,refresh,isPlatformAdmin,adminError}=useCommunity();
  const {isSignedIn}=useDemoSession();
  const [query,setQuery]=useState('');
  const {view}=useLocalSearchParams<{view?:string}>();
  const mine=view==='mine';
  const setMine=(value:boolean)=>router.setParams({view:value?'mine':'explore'});
  const shown=useMemo(()=>groups.filter(g=>(mine?['active','pending'].includes(g.membership_status??''):!g.approval_status||g.approval_status==='approved')&&`${g.name} ${g.city}`.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim())),[groups,mine,query]);
  return <Screen title="Grupos" subtitle="Encuentra con quién patinar." refresh={()=>void refresh()} refreshing={isLoading&&groups.length>0}>
    {isPlatformAdmin?<Button secondary onPress={()=>router.push('/group-requests')}>Administración general · Todos los grupos</Button>:null}
    {adminError?<Notice title="No pudimos verificar tu acceso administrativo" text={adminError} action="Reintentar" onAction={()=>void refresh()}/>:null}
    <Field label="Buscar grupo o ciudad" placeholder="Nombre o ciudad" value={query} onChangeText={setQuery}/>
    <View style={ui.row}><Button secondary={mine} onPress={()=>setMine(false)}>Explorar</Button><Button secondary={!mine} onPress={()=>setMine(true)}>Mis grupos</Button></View>
    {isLoading&&!groups.length?<ActivityIndicator color="#FF9A45"/>:groupsError?<Notice title="No pudimos cargar los grupos" text={groupsError} action="Reintentar" onAction={()=>void refresh()}/>:shown.length?shown.map(g=><Card key={g.id}><Text style={ui.accent}>{g.city||'Comunidad de patinaje'}</Text><View style={ui.row}><GroupLogo name={g.name} path={g.logo_url}/><Text style={[ui.heading,{flex:1}]}>{g.name}</Text></View><Text numberOfLines={3} style={ui.muted}>{g.description}</Text><Text style={ui.muted}>{g.approval_status==='pending'?'Creación pendiente de aprobación':g.approval_status==='rejected'?'Creación rechazada':g.member_count+' miembros'} · {g.membership_status==='active'?'Eres miembro':g.membership_status==='pending'?'Solicitud pendiente':g.join_policy==='open'?'Ingreso abierto':'Ingreso por aprobación'}</Text><Button secondary onPress={()=>router.push({pathname:'/group',params:{id:g.id}})}>Ver grupo</Button></Card>):<Notice title={mine?'Todavía no tienes grupos':'Sin resultados'} text={mine?'Únete a una comunidad para ver sus actividades.':'Prueba con otro nombre o ciudad.'}/>}
    <Button secondary onPress={()=>router.push(isSignedIn?'/create-group':'/auth')}>Crear un grupo</Button>
  </Screen>;
}
