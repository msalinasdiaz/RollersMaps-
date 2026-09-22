import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text } from 'react-native';
import { Button, Card, Notice, Screen, ui } from '@/components/community-ui';
import { useCommunity } from '@/contexts/community';
import { supabase } from '@/lib/supabase';

type GroupRequest = { id: string; name: string; description: string; city: string; requester_name: string; approval_status: 'pending' | 'rejected'; approval_expires_at: string };
export default function GroupRequests() {
  const { isPlatformAdmin, isLoading: accountLoading, refresh } = useCommunity();
  const [requests, setRequests] = useState<GroupRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [referenceTime, setReferenceTime] = useState(() => Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!isPlatformAdmin) return;
    setLoading(true); setReferenceTime(Date.now());
    try {
      const result = await supabase.rpc('get_group_creation_requests');
      if (result.error) { setError('No pudimos cargar las solicitudes. Reintenta.'); return; }
      setRequests(result.data ?? []); setError(null);
    } catch { setError('No pudimos conectar con las solicitudes.'); }
    finally { setLoading(false); }
  }, [isPlatformAdmin]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); const interval = setInterval(() => void load(), 60000); return () => { clearTimeout(timer); clearInterval(interval); }; }, [load]);
  async function decide(id: string, decision: 'approve' | 'reject') {
    if (busy) return;
    setBusy(id); setError(null);
    try {
      const result = await supabase.rpc('review_group_creation', { p_group_id: id, p_decision: decision });
      if (result.error) { await load(); setError('No pudimos resolver la solicitud. Puede haber vencido o haber sido revisada.'); return; }
      await refresh(); await load();
    } catch { setError('No pudimos guardar la decisión. Revisa tu conexión.'); }
    finally { setBusy(null); }
  }
  function reject(request: GroupRequest) {
    Alert.alert('Rechazar grupo', 'No se habilitará ' + request.name + '. La solicitud se eliminará al completar las 48 horas desde su creación.', [
      { text: 'Volver', style: 'cancel' },
      { text: 'Rechazar', style: 'destructive', onPress: () => void decide(request.id, 'reject') },
    ]);
  }
  const visibleRequests = requests.filter(request => Date.parse(request.approval_expires_at) > referenceTime);
  return <Screen back title="Solicitudes de grupos" subtitle="Aprueba las comunidades que podrán participar en RollersMaps." refresh={() => void load()} refreshing={loading && requests.length > 0}>
    {accountLoading ? <ActivityIndicator color="#FF9A45" /> : !isPlatformAdmin ? <Notice title="Solo administración general" text="La aprobación de comunidades está reservada al administrador de RollersMaps." /> : <>
      {error ? <Notice title="Revisa las solicitudes" text={error} action="Reintentar" onAction={() => void load()} /> : null}
      {loading && !requests.length ? <ActivityIndicator color="#FF9A45" /> : !visibleRequests.length ? <Notice title="No hay solicitudes pendientes" text="Las nuevas solicitudes aparecerán aquí durante 48 horas." /> : visibleRequests.map(request => <Card key={request.id}>
        <Text style={ui.heading}>{request.name}</Text><Text style={ui.accent}>{request.city || 'Sin ciudad'}</Text>
        <Text style={ui.muted}>Solicitante: {request.requester_name}</Text><Text style={ui.text}>{request.description || 'Sin descripción'}</Text>
        <Text style={ui.muted}>Vence: {new Date(request.approval_expires_at).toLocaleString('es-CL')}</Text>
        {request.approval_status === 'rejected' ? <Text style={ui.accent}>Rechazada · se eliminará al vencer el plazo.</Text> :
          <><Button busy={busy === request.id} disabled={busy !== null} onPress={() => void decide(request.id, 'approve')}>Aprobar grupo</Button><Button secondary disabled={busy !== null} onPress={() => reject(request)}>Rechazar</Button></>}
      </Card>)}
    </>}
  </Screen>;
}
