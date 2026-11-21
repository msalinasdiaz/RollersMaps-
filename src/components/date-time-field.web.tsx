import { useState } from 'react';
import { Text, View } from 'react-native';
import { Field, ui } from './community-ui';
import { formatLocalActivityDate, parseLocalActivityDate } from '@/lib/activity-editor';
type Props = { label: string; value: Date | null; onChange: (value: Date | null) => void; disabled?: boolean };
export function DateTimeField({ label, value, onChange, disabled }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  return <View style={{ gap: 6 }}><Field label={label} value={editing ?? formatLocalActivityDate(value)} editable={!disabled} placeholder="AAAA-MM-DD HH:mm"
    onChangeText={text => { setEditing(text); onChange(parseLocalActivityDate(text)); }} onBlur={() => { if (value) setEditing(null); }} />
    <Text style={ui.muted}>Fecha y hora local: AAAA-MM-DD HH:mm.</Text></View>;
}
