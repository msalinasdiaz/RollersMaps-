import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, Notice, Screen, ui } from '@/components/community-ui';
import { useDemoSession } from '@/contexts/demo-session';
import { useCommunity } from '@/contexts/community';
import { GpsTargetIcon } from '@/components/gps-target-icon';

export default function HomeScreen() {
  const { profile, isJoined }=useDemoSession();
  const { groups,activities,calendarError }=useCommunity();
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer);},[]);
  const next=activities.find(a=>isJoined(a.id)&&a.date.getTime()>now);
  const memberships=groups.filter(g=>g.membership_status==='active');
  const firstName=profile?.displayName?.trim().split(/\s+/)[0];
  return <Screen title={firstName?`Hola, ${firstName}`:'Tu próxima salida'} subtitle="Patina a tu ritmo. Encuentra tu comunidad.">
    <Card><View style={{gap:15,paddingVertical:12}}><GpsTargetIcon color="#FF9A45" size={44}/><Text style={[ui.title,{fontSize:30}]}>Sal a patinar</Text><Text style={ui.muted}>Registra tu recorrido con GPS y guárdalo, incluso sin conexión.</Text><Button onPress={()=>router.push('/track')}>Iniciar recorrido</Button><Button secondary onPress={()=>router.navigate('/explore')}>Explorar rutas</Button></View></Card>
    {next?<Card><Text style={ui.heading}>Próxima actividad</Text><Text style={ui.accent}>{next.groupName}</Text><Text style={ui.heading}>{next.title}</Text><Text style={ui.muted}>{next.date.toLocaleDateString('es-CL',{weekday:'long',day:'numeric',month:'short'})} · {next.time}</Text><Button secondary onPress={()=>router.navigate('/calendar')}>Ver próxima actividad</Button></Card>:calendarError&&memberships.length?<Notice title="No pudimos actualizar tus actividades" text="Puedes seguir usando el GPS y tus recorridos."/>:null}
    <Card><Text style={ui.heading}>{memberships.length?'Tus comunidades':'También se patina en grupo'}</Text><Text style={ui.muted}>{memberships.length?memberships.map(g=>g.name).join(' · '):'Descubre grupos de patinaje y solicita tu ingreso para acceder a sus calendarios.'}</Text><Button secondary onPress={()=>router.navigate({pathname:'/groups',params:{view:memberships.length?'mine':'explore'}})}>{memberships.length?'Ver mis grupos':'Descubrir grupos'}</Button></Card>
  </Screen>;
}
