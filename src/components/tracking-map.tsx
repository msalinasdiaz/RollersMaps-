import { Camera, type CameraRef, GeoJSONSource, Layer, Map, ViewAnnotation } from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { routeBounds, routeGeometry, type RouteCoordinate } from '@/lib/route-geometry';

export function TrackingMap({ route, location, recenterRequest=0, overview=false, bottomInset=250 }: {
  route: RouteCoordinate[]; location: RouteCoordinate | null; recenterRequest?: number; overview?: boolean; bottomInset?: number;
}) {
  const [state,setState]=useState<'loading'|'ready'|'error'>('loading');
  const [attempt,setAttempt]=useState(0);
  const camera=useRef<CameraRef>(null);
  const lastRecenter=useRef(-1);
  const geometry=useMemo(()=>routeGeometry(route),[route]);
  useEffect(()=>{
    if(state!=='ready' || !overview || !route.length)return;
    camera.current?.fitBounds(routeBounds(route),{padding:{top:60,bottom:bottomInset,left:45,right:45},duration:400});
  },[state,overview,route,bottomInset]);
  useEffect(()=>{
    if(state!=='ready' || overview)return;
    if(location && lastRecenter.current!==recenterRequest){
      lastRecenter.current=recenterRequest;
      camera.current?.easeTo({center:[location.longitude,location.latitude],zoom:16,padding:{bottom:bottomInset,top:90,left:20,right:20},duration:400});
    }
  },[state,overview,location,recenterRequest,bottomInset]);
  const start=route[0],finish=route.at(-1);
  return <View style={StyleSheet.absoluteFill}>
    <Map key={attempt} androidView="texture" attribution attributionPosition={{bottom:bottomInset+8,left:8}} compass compassPosition={{top:110,right:16}} logo={false}
      mapStyle="https://tiles.openfreemap.org/styles/dark" style={StyleSheet.absoluteFill}
      onDidFailLoadingMap={()=>setState('error')} onDidFinishLoadingMap={()=>setState('ready')}>
      <Camera ref={camera} initialViewState={{center:location?[location.longitude,location.latitude]:[-70.6498,-33.4324],zoom:location?16:12}} />
      {geometry?<GeoJSONSource id="tracking-route" data={{type:'Feature',properties:{},geometry}}>
        <Layer id="tracking-halo" type="line" layout={{'line-cap':'round','line-join':'round'}} paint={{'line-color':'#161616','line-width':9,'line-opacity':.7}}/>
        <Layer id="tracking-line" type="line" layout={{'line-cap':'round','line-join':'round'}} paint={{'line-color':'#FF7900','line-width':5}}/>
      </GeoJSONSource>:null}
      {start?<ViewAnnotation id="tracking-start" lngLat={[start.longitude,start.latitude]}><View style={[styles.pin,{backgroundColor:'#8DE650'}]}/></ViewAnnotation>:null}
      {overview&&finish?<ViewAnnotation id="tracking-finish" lngLat={[finish.longitude,finish.latitude]}><View style={styles.flag}><Text style={{fontSize:16}}>⚑</Text></View></ViewAnnotation>:null}
      {!overview&&location?<ViewAnnotation id="tracking-position" lngLat={[location.longitude,location.latitude]}><View style={styles.location}><View style={styles.center}/></View></ViewAnnotation>:null}
    </Map>
    {state!=='ready'?<View style={styles.loading} pointerEvents="box-none">
      {state==='loading'?<ActivityIndicator color="#FF9A45"/>:null}
      <Text style={styles.text}>{state==='loading'?'Cargando mapa…':'Mapa sin conexión. El GPS puede seguir guardando tu recorrido.'}</Text>
      {state==='error'?<Pressable accessibilityRole="button" onPress={()=>{lastRecenter.current=-1;setState('loading');setAttempt(n=>n+1);}}><Text style={styles.retry}>Reintentar mapa</Text></Pressable>:null}
    </View>:null}
  </View>;
}
const styles=StyleSheet.create({
  pin:{height:16,width:16,borderRadius:8,borderWidth:2,borderColor:'#FFFFFF'},
  flag:{width:28,height:28,borderRadius:14,backgroundColor:'#FFFFFF',alignItems:'center',justifyContent:'center'},
  location:{height:38,width:38,borderRadius:19,backgroundColor:'#467EFF44',alignItems:'center',justifyContent:'center'},
  center:{height:18,width:18,borderRadius:9,borderWidth:3,borderColor:'#FFFFFF',backgroundColor:'#447BFF'},
  loading:{position:'absolute',top:'30%',alignSelf:'center',maxWidth:280,backgroundColor:'#101114EE',padding:18,borderRadius:14,gap:12,alignItems:'center'},
  text:{color:'#D3D5DB',fontSize:14,textAlign:'center'},retry:{color:'#FF9A45',fontSize:15,fontWeight:'700',padding:10},
});
