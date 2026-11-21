import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { Button, Card, Field, Screen, ui } from '@/components/community-ui';
import { useDemoSession } from '@/contexts/demo-session';
import { useCommunity } from '@/contexts/community';
import { blockUser, reportReasons, submitContentReport, type ContentKind, type ReportReason } from '@/lib/moderation';

export default function ReportContentScreen() {
  const { kind,targetId,userId }=useLocalSearchParams<{kind?:string;targetId?:string;userId?:string}>();const {user}=useDemoSession();const {refresh}=useCommunity();
  const [reason,setReason]=useState<ReportReason>('harassment');const [details,setDetails]=useState('');const [busy,setBusy]=useState(false);const [sent,setSent]=useState(false);const [message,setMessage]=useState<string|null>(null);
  if(!user)return <Redirect href="/auth"/>;
  if(!targetId||!['group','activity','user'].includes(kind??'')||!/^([0-9a-f]{8}-)([0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(targetId))return <Screen title="Reportar contenido" back><Text style={ui.muted}>El contenido no está disponible.</Text></Screen>;
  const submit=async()=>{if(busy||sent)return;setBusy(true);try{await submitContentReport(kind as ContentKind,targetId,reason,details);setSent(true);setMessage('Reporte recibido. La administración revisará el contenido.');}catch(error){setMessage(error instanceof Error?error.message:'No pudimos enviar el reporte.');}finally{setBusy(false);}};
  const block=async()=>{const targetUser=kind==='user'?targetId:userId;if(!targetUser||targetUser===user.id||busy)return;setBusy(true);try{await blockUser(targetUser);await refresh();setMessage('Usuario bloqueado. Puedes desbloquearlo desde Cuenta.');}catch(error){setMessage(error instanceof Error?error.message:'No pudimos bloquear al usuario.');}finally{setBusy(false);}};
  return <Screen title="Reportar contenido" back><Card><Text style={ui.muted}>Elige el motivo. No incluyas contraseñas, documentos ni información privada innecesaria.</Text>{(Object.entries(reportReasons) as [ReportReason,string][]).map(([value,label])=><Button key={value} secondary={reason!==value} disabled={busy||sent} onPress={()=>setReason(value)}>{label}</Button>)}<Field label="Detalles (opcional)" multiline maxLength={1000} value={details} onChangeText={setDetails} editable={!busy&&!sent}/><Button busy={busy} disabled={sent} onPress={()=>void submit()}>Enviar reporte</Button></Card>{((kind==='user'&&targetId!==user.id)||userId&&userId!==user.id)?<Button secondary disabled={busy} onPress={()=>void block()}>Bloquear este usuario</Button>:null}{message?<Text accessibilityLiveRegion="polite" style={ui.muted}>{message}</Text>:null}</Screen>;
}
