import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Modal, ScrollView, Text, View } from 'react-native';
import { Button, Card, Field, Notice, Screen, ui } from '@/components/community-ui';
import { useCommunity } from '@/contexts/community';
import { useDemoSession } from '@/contexts/demo-session';
import { currentPlatformGroups, groupFilters, type GroupDeletion, type GroupFilter, type PlatformGroup } from '@/lib/platform-groups';
import { supabase } from '@/lib/supabase';

export default function GroupRequests() {
  const { isPlatformAdmin, adminError, isLoading, refresh } = useCommunity();
  const { user } = useDemoSession();
  if (isPlatformAdmin && user) return <PlatformGroups key={user.id} />;
  return <Screen back title="Administración general">
    {adminError ? <Notice title="No pudimos verificar tu acceso" text={adminError} action="Reintentar" onAction={() => void refresh()} /> :
      isLoading ? <ActivityIndicator color="#FF9A45" /> :
        <Notice title="Solo administración general" text="La revisión de comunidades está reservada al administrador de RollersMaps." />}
  </Screen>;
}
function PlatformGroups() {
  const { refresh } = useCommunity();
  const [groups, setGroups] = useState<PlatformGroup[]>([]);
  const [filter, setFilter] = useState<GroupFilter>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [referenceTime, setReferenceTime] = useState(() => Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<PlatformGroup | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [history, setHistory] = useState<GroupDeletion[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const sequence = useRef(0);
  const deciding = useRef(false);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true); setReferenceTime(Date.now());
    try {
      const result = await supabase.rpc('get_platform_groups');
      if (request !== sequence.current) return;
      if (result.error) { setGroups([]); setError('No pudimos cargar los grupos. Reintenta.'); return; }
      setGroups(result.data ?? []); setError(null);
    } catch {
      if (request === sequence.current) { setGroups([]); setError('No pudimos conectar con los grupos.'); }
    } finally { if (request === sequence.current) setLoading(false); }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    const interval = setInterval(() => { if (AppState.currentState === 'active') void load(); }, 60000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void load(); });
    const requestSequence = sequence;
    return () => { ++requestSequence.current; clearTimeout(timer); clearInterval(interval); listener.remove(); };
  }, [load]);
  async function decide(id: string, decision: 'approve' | 'reject') {
    if (deciding.current) return;
    deciding.current = true; setBusy(id); setError(null);
    try {
      const result = await supabase.rpc('review_group_creation', { p_group_id: id, p_decision: decision });
      await load();
      if (result.error) setError('No pudimos resolver la solicitud. Puede haber vencido o haber sido revisada.');
      else await refresh();
    } catch { setError('No pudimos guardar la decisión. Actualiza antes de volver a intentarlo.'); }
    finally { deciding.current = false; setBusy(null); }
  }
  function reject(group: PlatformGroup) {
    Alert.alert('Rechazar grupo', 'No se habilitará ' + group.name + '. La solicitud se eliminará al completar las 48 horas desde su creación.', [
      { text: 'Volver', style: 'cancel' },
      { text: 'Rechazar', style: 'destructive', onPress: () => void decide(group.id, 'reject') },
    ]);
  }
  async function loadHistory() {
    setHistoryLoading(true); setHistoryError(null);
    try {
      const result = await supabase.rpc('get_platform_group_deletions');
      if (result.error) throw result.error;
      setHistory(result.data ?? []);
    } catch { setHistoryError('No pudimos cargar el historial de eliminaciones.'); }
    finally { setHistoryLoading(false); }
  }
  async function removeGroup() {
    if (!deleting || deciding.current || confirmation.trim() !== deleting.name.trim()) return;
    deciding.current = true; setBusy(deleting.id); setError(null);
    try {
      const result = await supabase.rpc('delete_platform_group', { p_group_id: deleting.id, p_confirmation_name: confirmation });
      if (result.error) { setError('No pudimos eliminar el grupo. Puede haber cambiado; actualiza la lista y vuelve a intentarlo.'); return; }
      setDeleting(null); setConfirmation('');
      await load(); await refresh();
      if (history !== null) await loadHistory();
    } catch { setError('No pudimos confirmar la eliminación. Actualiza la lista antes de reintentar.'); }
    finally { deciding.current = false; setBusy(null); }
  }
  const current = currentPlatformGroups(groups, referenceTime);
  const shown = current.filter(group => (filter === 'all' || group.approval_status === filter) &&
    (group.name + ' ' + group.city + ' ' + group.requester_name).toLocaleLowerCase('es').includes(query.trim().toLocaleLowerCase('es')));
  return <Screen back title="Administración general" subtitle="Todos los grupos de RollersMaps y sus solicitudes de creación." refresh={() => void load()} refreshing={loading && groups.length > 0}>
    <Field label="Buscar grupo, ciudad o creador" value={query} onChangeText={setQuery} />
    <View style={[ui.row, { flexWrap: 'wrap' }]}>{groupFilters.map(item => <Button key={item.value} secondary={filter !== item.value} onPress={() => setFilter(item.value)}>{item.label + ' (' + current.filter(g => item.value === 'all' || g.approval_status === item.value).length + ')'}</Button>)}</View>
    {error ? <Notice title="No pudimos actualizar" text={error} action="Reintentar" onAction={() => void load()} /> :
      loading && !groups.length ? <ActivityIndicator color="#FF9A45" /> :
        !shown.length ? <Notice title="No hay grupos en esta vista" text="Revisa otro estado o cambia tu búsqueda." /> :
          shown.map(group => <Card key={group.id}>
            <Text style={ui.accent}>{group.approval_status === 'pending' ? 'Pendiente de aprobación' : group.approval_status === 'rejected' ? 'Rechazado' : group.is_active ? 'Aprobado' : 'Aprobado · inactivo'}</Text>
            <Text style={ui.heading}>{group.name}</Text>
            <Text style={ui.muted}>{group.city || 'Sin ciudad'} · Creado por {group.requester_name}</Text>
            <Text style={ui.text}>{group.description || 'Sin descripción'}</Text>
            {group.approval_status === 'approved' ? <Text style={ui.muted}>{group.member_count} miembros</Text> :
              <Text style={ui.muted}>Se elimina sin aprobación el {new Date(group.approval_expires_at!).toLocaleString('es-CL')}.</Text>}
            {group.approval_status === 'pending' ? <>
              <Button busy={busy === group.id} disabled={busy !== null} onPress={() => void decide(group.id, 'approve')}>Aprobar grupo</Button>
              <Button secondary disabled={busy !== null} onPress={() => reject(group)}>Rechazar</Button>
            </> : null}
            <Button secondary disabled={busy !== null} onPress={() => { setDeleting(group); setConfirmation(''); setError(null); }}>Eliminar grupo</Button>
          </Card>)}
    <Button secondary busy={historyLoading} disabled={historyLoading} onPress={() => void loadHistory()}>Ver historial de eliminaciones</Button>
    {historyError ? <Text style={[ui.text, { color: '#FF9C9C' }]}>{historyError}</Text> : null}
    {history !== null ? <Card>
      <Text style={ui.heading}>Últimas eliminaciones</Text>
      {!history.length ? <Text style={ui.muted}>Todavía no se han eliminado grupos.</Text> : history.map(item => <View key={item.id} style={{ gap: 5, paddingVertical: 10 }}>
        <Text style={ui.text}>{item.group_name}</Text>
        <Text style={ui.muted}>{new Date(item.deleted_at).toLocaleString('es-CL')} · {item.administrator_name}</Text>
        <Text style={ui.muted}>{item.member_count} membresías · {item.activity_count} actividades · {item.registration_count} inscripciones</Text>
      </View>)}
    </Card> : null}
    <Modal visible={deleting !== null} transparent animationType="fade" onRequestClose={() => { if (!busy) setDeleting(null); }}>
      <View style={{ flex: 1, justifyContent: 'center', padding: 22, backgroundColor: '#000000CC' }}>
        <ScrollView style={{ maxHeight: '85%', flexGrow: 0 }} keyboardShouldPersistTaps="handled">
          <Card>
            <Text style={ui.heading}>Eliminar grupo</Text>
            <Text style={ui.text}>Se eliminará {deleting?.name}, sus membresías, actividades e inscripciones. Esta acción no se puede deshacer.</Text>
            <Text style={ui.muted}>Los recorridos GPS personales se conservan. La eliminación queda registrada con tu usuario y la fecha.</Text>
            <Field label="Escribe el nombre del grupo para confirmar" value={confirmation} onChangeText={setConfirmation} editable={busy === null} autoCapitalize="none" />
            {error ? <Text style={[ui.text, { color: '#FF9C9C' }]}>{error}</Text> : null}
            <Button busy={busy !== null} disabled={busy !== null || !deleting || confirmation.trim() !== deleting.name.trim()} onPress={() => void removeGroup()}>Eliminar definitivamente</Button>
            <Button secondary disabled={busy !== null} onPress={() => setDeleting(null)}>Volver</Button>
          </Card>
        </ScrollView>
      </View>
    </Modal>
  </Screen>;
}
