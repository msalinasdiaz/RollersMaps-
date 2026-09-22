import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useRef, useState } from 'react';
import { Image, Platform, Text, View } from 'react-native';
import { Button, Card, ui } from '@/components/community-ui';
import { GroupLogo } from '@/components/group-logo';
import { type Group } from '@/contexts/community';
import { canManageGroup } from '@/lib/group-permissions';
import { supabase } from '@/lib/supabase';

export function GroupLogoEditor({ group, onSaved }: { group: Group; onSaved: () => Promise<void> }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const locked = useRef(false);
  if (!canManageGroup(group)) return null;

  async function choose() {
    if (locked.current) return;
    locked.current = true; setBusy(true); setMessage(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsMultipleSelection: false, quality: 1,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.width || !asset.height || asset.width * asset.height > 40_000_000) {
        setMessage('Elige una imagen de hasta 40 megapíxeles.'); return;
      }
      const context = ImageManipulator.manipulate(asset.uri);
      let rendered: Awaited<ReturnType<typeof context.renderAsync>> | undefined;
      try {
        context.resize(asset.width >= asset.height ? { width: Math.min(asset.width, 512) } : { height: Math.min(asset.height, 512) });
        rendered = await context.renderAsync();
        const resultImage = await rendered.saveAsync({ format: SaveFormat.PNG });
        setSelected(resultImage.uri);
      } finally { rendered?.release(); context.release(); }
    } catch { setMessage('No pudimos abrir esa imagen. Prueba con otra foto o un archivo PNG.'); }
    finally { locked.current = false; setBusy(false); }
  }
  async function save() {
    if (!selected || locked.current) return;
    locked.current = true; setBusy(true); setMessage(null);
    try {
      const data = Platform.OS === 'web' ? await (await fetch(selected)).arrayBuffer() : await new File(selected).arrayBuffer();
      if (!data.byteLength || data.byteLength > 2 * 1024 * 1024) { setMessage('El logo debe pesar menos de 2 MB. Elige otra imagen.'); return; }
      const path = group.id + '/' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.png';
      const upload = await supabase.storage.from('group-logos').upload(path, data, { contentType: 'image/png', upsert: false, cacheControl: '3600' });
      if (upload.error) throw upload.error;
      const update = await supabase.rpc('set_group_logo', { p_group_id: group.id, p_logo_path: path });
      if (update.error) throw update.error;
      setSelected(null); setMessage('Logo actualizado.');
      await onSaved();
    } catch {
      setMessage('No pudimos guardar el logo. Revisa tu conexión y que sigas siendo administrador, e inténtalo nuevamente.');
    } finally { locked.current = false; setBusy(false); }
  }
  return <Card><Text style={ui.heading}>Logo del grupo</Text>
    <View style={{ alignItems: 'center', paddingVertical: 8 }}>
      {selected ? <Image source={{ uri: selected }} accessibilityLabel="Vista previa del nuevo logo" style={{ width: 112, height: 112, borderRadius: 16 }} resizeMode="contain" /> :
        <GroupLogo name={group.name} path={group.logo_url} size={112} />}
    </View>
    <Text style={ui.muted}>Elige una imagen de tu galería. Se mostrará en el grupo y sus actividades.</Text>
    <Button secondary disabled={busy} onPress={() => void choose()}>{selected ? 'Elegir otra imagen' : group.logo_url ? 'Cambiar logo' : 'Elegir logo'}</Button>
    {selected ? <><Button busy={busy} onPress={() => void save()}>Guardar logo</Button><Button secondary disabled={busy} onPress={() => { setSelected(null); setMessage(null); }}>Descartar selección</Button></> : null}
    {message ? <Text accessibilityLiveRegion="polite" style={ui.muted}>{message}</Text> : null}
  </Card>;
}
