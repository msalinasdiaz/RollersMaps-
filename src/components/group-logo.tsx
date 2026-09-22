import { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { supabase } from '@/lib/supabase';

export function GroupLogo({ name, path, size = 44 }: { name: string; path?: string | null; size?: number }) {
  const [resolved, setResolved] = useState<{ path: string; uri: string } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    let active = true;
    async function resolve() {
      try {
        const { data, error } = await supabase.storage.from('group-logos').createSignedUrl(path!, 3600);
        if (active && !error && data) setResolved({ path: path!, uri: data.signedUrl });
      } catch { /* Initials remain visible if the logo cannot be loaded. */ }
    }
    void resolve();
    const refresh = setInterval(() => void resolve(), 50 * 60_000);
    return () => { active = false; clearInterval(refresh); };
  }, [path]);
  const uri = resolved && resolved.path === path && failed !== resolved.uri ? resolved.uri : null;
  return <View style={{ width: size, height: size, borderRadius: size / 4, backgroundColor: '#28221C', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
    {uri ? <Image accessibilityLabel={`Logo de ${name}`} source={{ uri }} style={{ width: size, height: size }} resizeMode="contain" onError={() => setFailed(uri)} /> :
      <Text accessibilityLabel={name} style={{ color: '#FFB35F', fontSize: size * 0.34, fontWeight: '800' }}>{name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase()}</Text>}
  </View>;
}
