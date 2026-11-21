import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Button, Field, Notice, Screen, ui } from '@/components/community-ui';
import { DateTimeField } from '@/components/date-time-field';
import { useCommunity } from '@/contexts/community';
import { supabase } from '@/lib/supabase';
import { hasAcceptedTerms } from '@/lib/moderation';
import { validateActivityDraft, type ActivityFieldErrors } from '@/lib/activity-editor';
import { activityTypeLabels, type ActivityType } from '@/data/activities';

export default function ActivityEditor() {
  const { groupId, activityId } = useLocalSearchParams<{ groupId: string; activityId?: string }>();
  const { groups, refresh } = useCommunity();
  const group = groups.find(g => g.id === groupId);
  const allowed = group?.membership_status === 'active' && ['admin', 'owner'].includes(group.membership_role ?? '');
  const [title, setTitle] = useState(''), [point, setPoint] = useState(''), [description, setDescription] = useState('');
  const [start, setStart] = useState<Date | null>(null), [end, setEnd] = useState<Date | null>(null);
  const [capacity, setCapacity] = useState('30'), [type, setType] = useState<ActivityType>('ruta');
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(Boolean(activityId));
  const [loaded, setLoaded] = useState(!activityId), [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null), [fields, setFields] = useState<ActivityFieldErrors>({});
  const saving = useRef(false);

  useEffect(() => {
    if (!activityId || !allowed) return;
    let active = true;
    const load = async () => {
      setLoading(true); setLoaded(false); setError(null);
      try {
        const result = await supabase.from('activities').select('title,meeting_point,description,starts_at,ends_at,capacity,activity_type').eq('id', activityId).eq('group_id', groupId).single();
        if (!active) return;
        if (result.error || !result.data) { setError('No pudimos cargar esta actividad. Puedes intentarlo de nuevo.'); return; }
        const data = result.data;
        setTitle(data.title); setPoint(data.meeting_point); setDescription(data.description ?? '');
        setStart(new Date(data.starts_at)); setEnd(data.ends_at ? new Date(data.ends_at) : null);
        setCapacity(String(data.capacity)); setType(data.activity_type); setLoaded(true); setError(null);
      } catch {
        if (active) setError('No pudimos conectar. Revisa tu conexión y vuelve a cargar la actividad.');
      } finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [activityId, groupId, allowed, attempt]);

  async function save(status: 'draft' | 'published' | 'cancelled') {
    if (saving.current || !allowed || loading || !loaded) return;
    const nextErrors = validateActivityDraft({ title, point, start, end, capacity });
    if (status !== 'cancelled' && Object.keys(nextErrors).length) { setFields(nextErrors); setError('Revisa los campos indicados.'); return; }
    if (status === 'cancelled' && !activityId) return;
    saving.current = true; setBusy(true); setError(null); setFields({});
    try {
      if (status !== 'cancelled' && !(await hasAcceptedTerms())) {
        setError('Acepta las normas para guardar esta actividad. Tus cambios permanecen aquí.');
        router.push({ pathname: '/legal', params: { section: 'terms' } });
        return;
      }
      if (status === 'cancelled') {
        const result = await supabase.from('activities').update({ status }).eq('id', activityId!).eq('group_id', groupId).select('id').single();
        if (result.error) { setError('No pudimos cancelar la actividad. Inténtalo nuevamente.'); return; }
        await refresh(); router.back(); return;
      }
      const payload = {
        group_id: groupId, title: title.trim(), meeting_point: point.trim(), description: description.trim(),
        starts_at: start!.toISOString(), ends_at: end!.toISOString(), capacity: Number(capacity),
        activity_type: type, status, helmet_required: true,
      };
      const result = activityId
        ? await supabase.from('activities').update(payload).eq('id', activityId).eq('group_id', groupId).select('id').single()
        : await supabase.from('activities').insert(payload).select('id').single();
      if (result.error) { setError('No pudimos guardar la actividad. Revisa tu conexión, permisos y aceptación de las normas.'); return; }
      await refresh(); router.back();
    } catch { setError('No pudimos guardar. Tus cambios siguen en esta pantalla; inténtalo nuevamente.'); }
    finally { saving.current = false; setBusy(false); }
  }

  const disabled = busy || loading || !loaded;
  const fieldError = (key: keyof ActivityFieldErrors) => fields[key] ? <Text accessibilityLiveRegion="polite" style={{ color: '#FFB4A3', fontSize: 14 }}>{fields[key]}</Text> : null;
  return <Screen back title={activityId ? 'Editar actividad' : 'Nueva actividad'} subtitle={group?.name}>
    {!allowed ? <Notice title="Acceso reservado a administradores" /> : <>
      {loading ? <Notice title="Cargando actividad…" /> : null}
      {error ? <Notice title="Revisa la actividad" text={error} action={!loaded && !loading ? 'Volver a cargar' : undefined}
        onAction={() => { setLoading(true); setError(null); setAttempt(n => n + 1); }} /> : null}
      <Field label="Nombre" value={title} onChangeText={setTitle} editable={!disabled} maxLength={90} />{fieldError('title')}
      <View style={ui.row}>{(Object.keys(activityTypeLabels) as ActivityType[]).map(t => <Button key={t} secondary={type !== t} disabled={disabled} onPress={() => setType(t)}>{activityTypeLabels[t]}</Button>)}</View>
      <DateTimeField label="Inicio" value={start} onChange={setStart} disabled={disabled} />{fieldError('start')}
      <DateTimeField label="Término" value={end} onChange={setEnd} disabled={disabled} />{fieldError('end')}
      <Text style={ui.muted}>Horario local de este dispositivo. Revisa las fechas antes de publicar.</Text>
      <Field label="Punto de encuentro" value={point} onChangeText={setPoint} editable={!disabled} maxLength={120} />{fieldError('point')}
      <Field label="Cupos" value={capacity} onChangeText={setCapacity} editable={!disabled} keyboardType="number-pad" maxLength={3} />{fieldError('capacity')}
      <Field multiline label="Indicaciones" value={description} onChangeText={setDescription} editable={!disabled} maxLength={600} />
      <Button secondary onPress={() => router.push({ pathname: '/legal', params: { section: 'terms' } })}>Normas de la comunidad</Button>
      <Button busy={busy} disabled={disabled} onPress={() => void save('published')}>Publicar actividad</Button>
      <Button secondary disabled={disabled} onPress={() => void save('draft')}>Guardar borrador</Button>
      {activityId ? <Button secondary disabled={disabled} onPress={() => Alert.alert('Cancelar actividad', 'La actividad dejará de estar disponible para participar. Esta acción no guarda los cambios de este formulario.', [
        { text: 'Volver', style: 'cancel' }, { text: 'Cancelar actividad', style: 'destructive', onPress: () => void save('cancelled') },
      ])}>Cancelar actividad</Button> : null}
    </>}
  </Screen>;
}
