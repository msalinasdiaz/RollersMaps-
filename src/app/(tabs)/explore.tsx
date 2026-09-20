import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Button, Card, Notice, Screen, ui } from '@/components/community-ui';
import { useRoutes } from '@/hooks/use-routes';
import { classLevels } from '@/data/skating-levels';

export default function Explore(){
  const {routes,isLoading,error,refresh}=useRoutes();
  const [view,setView]=useState<'routes'|'levels'>('routes');
  return <Screen back title="Explorar rutas" subtitle="Ideas para tu próxima salida." refresh={()=>void refresh()} refreshing={isLoading&&routes.length>0}>
    <Button onPress={()=>router.push('/track')}>Abrir mapa y GPS</Button>
    <View style={ui.row}><Button secondary={view!=='routes'} onPress={()=>setView('routes')}>Catálogo</Button><Button secondary={view!=='levels'} onPress={()=>setView('levels')}>Técnica y niveles</Button></View>
    {view==='routes'?isLoading?<ActivityIndicator color="#FF9A45"/>:error?<Notice title="No pudimos cargar las rutas" text="Puedes seguir usando el GPS para registrar una salida libre." action="Reintentar" onAction={()=>void refresh()}/>:routes.length?routes.map(r=><Card key={r.id}><Text style={ui.heading}>{r.name}</Text><Text style={ui.accent}>{[r.skillLevel,r.distanceKm?`${r.distanceKm} km`:null].filter(Boolean).join(' · ')}</Text><Text style={ui.muted}>{r.description}</Text></Card>):<Notice title="Todavía no hay rutas publicadas"/>:classLevels.map(l=><Card key={l.level}><Text style={ui.accent}>Nivel {l.level}</Text><Text style={ui.heading}>{l.title}</Text><Text style={ui.muted}>{l.summary}</Text>{l.skills.map(skill=><Text key={skill} style={ui.text}>• {skill}</Text>)}</Card>)}
  </Screen>;
}
