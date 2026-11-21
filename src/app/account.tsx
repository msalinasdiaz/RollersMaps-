import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Text } from 'react-native';
import { Button, Card, Field, Screen, ui } from '@/components/community-ui';
import { useDemoSession } from '@/contexts/demo-session';
import { useCommunity } from '@/contexts/community';
import { DELETE_ACCOUNT_CONFIRMATION,getAccountDeletionStatus,type AccountDeletionStatus } from '@/lib/account';
import { LEGAL_CONTACT } from '@/lib/legal';
import { supabase } from '@/lib/supabase';
import { unblockUser } from '@/lib/moderation';

export default function AccountScreen(){
  const {user,deleteAccount,signOut}=useDemoSession();const {refresh}=useCommunity();const [status,setStatus]=useState<AccountDeletionStatus|null>(null);const [blocks,setBlocks]=useState<{blocked_id:string;display_name:string|null}[]>([]);const [confirmation,setConfirmation]=useState('');const [busy,setBusy]=useState(false);const [message,setMessage]=useState<string|null>(null);const lock=useRef(false);const ownerId=user?.id;
  const load=useCallback(async()=>{if(!ownerId)return;try{const state=await getAccountDeletionStatus();setStatus(state);const result=await supabase.rpc('get_my_blocked_users');if(!result.error)setBlocks(result.data??[]);}catch(error){setMessage(error instanceof Error?error.message:'No pudimos cargar tu cuenta.');}},[ownerId]);
  useEffect(()=>{const task=setTimeout(()=>void load(),0);return ()=>clearTimeout(task);},[load]);
  if(!user)return <Redirect href="/auth"/>;
  const remove=async()=>{if(lock.current||!status||status.owned_groups.length||confirmation.trim()!==DELETE_ACCOUNT_CONFIRMATION)return;lock.current=true;setBusy(true);setMessage(null);
    try{
      const state=await getAccountDeletionStatus();if(state.owned_groups.length){setStatus(state);throw new Error('Transfiere primero tus grupos.');}
      await deleteAccount(confirmation);
    }catch(error){setMessage(error instanceof Error?error.message:'No pudimos confirmar la eliminación.');}
    finally{lock.current=false;setBusy(false);}
  };
  const unblock=async(id:string)=>{if(lock.current)return;lock.current=true;setBusy(true);try{await unblockUser(id);await refresh();await load();}catch{setMessage('No pudimos desbloquear esta cuenta.');}finally{lock.current=false;setBusy(false);}};
  return <Screen title="Tu cuenta" back><Card><Text style={ui.heading}>Tu sesión</Text><Button secondary disabled={busy} onPress={()=>{if(lock.current)return;lock.current=true;setBusy(true);void signOut().finally(()=>{lock.current=false;setBusy(false);});}}>Cerrar sesión</Button></Card><Card><Text style={ui.heading}>Privacidad y ayuda</Text><Button secondary onPress={()=>router.push({pathname:'/legal',params:{section:'privacy'}})}>Privacidad</Button><Button secondary onPress={()=>router.push({pathname:'/legal',params:{section:'terms'}})}>Términos y comunidad</Button><Button secondary onPress={()=>void Linking.openURL(`mailto:${LEGAL_CONTACT}`)}>Contactar soporte</Button></Card>
    {blocks.length?<Card><Text style={ui.heading}>Usuarios bloqueados</Text>{blocks.map((block)=><Button key={block.blocked_id} secondary disabled={busy} onPress={()=>void unblock(block.blocked_id)}>{`Desbloquear a ${block.display_name?.trim()||("cuenta "+block.blocked_id.slice(0,8))}`}</Button>)}</Card>:null}
    <Card><Text style={ui.heading}>Eliminar mi cuenta</Text><Text style={ui.muted}>La eliminación es irreversible: retira tu cuenta, recorridos cloud, inscripciones e imágenes subidas, incluso logos de grupos donde colaboraste. Este teléfono detendrá el GPS y borrará tus recorridos locales. Los grupos no se cierran automáticamente.</Text>
      {!status?<Button secondary onPress={()=>void load()}>Comprobar cuenta</Button>:status.owned_groups.length?<><Text style={ui.muted}>Antes de eliminar, transfiere estos grupos desde sus integrantes o solicita ayuda a soporte:</Text>{status.owned_groups.map(group=><Button key={group.id} secondary onPress={()=>router.push({pathname:'/group',params:{id:group.id}})}>{group.name}</Button>)}<Button secondary onPress={()=>void Linking.openURL(`mailto:${LEGAL_CONTACT}?subject=Eliminar%20mi%20cuenta%20de%20RollersMaps`)}>Solicitar ayuda y eliminación</Button></>:<>{status.pending?<Text style={ui.muted}>La cuenta está en la cola de eliminación. Soporte puede finalizarla; escribe a rollersmaps.cl@gmail.com.</Text>:null}<Field label="Escribe ELIMINAR MI CUENTA" value={confirmation} onChangeText={setConfirmation} editable={!busy} autoCapitalize="characters"/><Button busy={busy} disabled={busy||status.pending||confirmation.trim()!==DELETE_ACCOUNT_CONFIRMATION} onPress={()=>void remove()}>Eliminar cuenta y datos</Button></>}
    </Card>{message?<Text accessibilityLiveRegion="polite" style={ui.muted}>{message}</Text>:null}</Screen>;
}


