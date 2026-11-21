import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Platform, Text, View } from 'react-native';
import { Button, ui } from './community-ui';
export type DateTimeFieldProps = { label: string; value: Date | null; onChange: (value: Date | null) => void; disabled?: boolean };
export function DateTimeField({ label, value, onChange, disabled }: DateTimeFieldProps) {
  const [mode, setMode] = useState<'date' | 'time' | null>(null), [draft, setDraft] = useState(new Date());
  const open = (nextMode: 'date' | 'time') => {
    const current = new Date(value && Number.isFinite(value.getTime()) ? value.getTime() : Date.now());
    current.setSeconds(0, 0);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: current, mode: nextMode, is24Hour: true,
        positiveButton: { label: 'Aceptar' }, negativeButton: { label: 'Cancelar' },
        onValueChange: (_event, selected) => { const minute = new Date(selected); minute.setSeconds(0, 0); onChange(minute); },
      });
    } else { setDraft(current); setMode(nextMode); }
  };
  return <View style={{ gap: 8 }}><Text style={ui.text}>{label}</Text><View style={ui.row}>
    <Button secondary disabled={disabled} onPress={() => open('date')}>{value ? value.toLocaleDateString('es-CL') : 'Elegir fecha'}</Button>
    <Button secondary disabled={disabled} onPress={() => open('time')}>{value ? value.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : 'Elegir hora'}</Button>
  </View>
    {Platform.OS === 'ios' && mode ? <Modal transparent animationType="fade" onRequestClose={() => setMode(null)}>
      <View style={{ flex: 1, backgroundColor: '#000000B8', justifyContent: 'center', padding: 20 }}><View style={[ui.card, { padding: 16 }]}>
        <Text accessibilityRole="header" style={ui.heading}>{label}</Text>
        <DateTimePicker value={draft} mode={mode} display="spinner" themeVariant="dark" locale="es-CL" onValueChange={(_event, selected) => { const minute = new Date(selected); minute.setSeconds(0, 0); setDraft(minute); }} />
        <Button onPress={() => { onChange(draft); setMode(null); }}>Listo</Button><Button secondary onPress={() => setMode(null)}>Cancelar</Button>
      </View></View>
    </Modal> : null}
  </View>;
}
