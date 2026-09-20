import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDemoSession } from '@/contexts/demo-session';

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0C0F14' }, content: { padding: 20, gap: 20, paddingBottom: 110 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 }, logo: { width: 34, height: 34 },
  title: { color: '#F4F5F7', fontSize: 28, fontWeight: '800' }, heading: { color: '#F4F5F7', fontSize: 19, fontWeight: '700' },
  text: { color: '#F4F5F7', fontSize: 15, lineHeight: 23 }, muted: { color: '#ABB3C0', fontSize: 14, lineHeight: 21 },
  accent: { color: '#FFAD69', fontSize: 13, fontWeight: '700' }, card: { backgroundColor: '#171C24', borderRadius: 18, padding: 18, gap: 12, borderWidth: 1, borderColor: '#29313D' },
  button: { backgroundColor: '#FF9A45', borderRadius: 12, paddingHorizontal: 16, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  secondary: { backgroundColor: '#252D39' }, buttonText: { color: '#17110C', fontSize: 15, fontWeight: '700' }, secondaryText: { color: '#EDF0F5' },
  disabled: { opacity: 0.5 }, row: { flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  input: { backgroundColor: '#10141B', borderWidth: 1, borderColor: '#3C4758', borderRadius: 11, minHeight: 48, color: '#F4F5F7', fontSize: 15, padding: 12 },
  separator: { height: 1, backgroundColor: '#303947' },
});
export function Screen({ title, subtitle, children, back, refresh, refreshing = false }: { title: string; subtitle?: string; children: ReactNode; back?: boolean; refresh?: () => void; refreshing?: boolean }) {
  const { isSignedIn, signOut } = useDemoSession();
  return <View style={ui.screen}><StatusBar style="light" /><SafeAreaView style={{ flex: 1 }} edges={['top']}>
    <ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled" refreshControl={refresh ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#FF9A45" /> : undefined}>
      <View style={ui.header}><View style={ui.brand}><Image source={require('@/assets/images/rollersmaps-adaptive-foreground.png')} style={ui.logo} /><Text style={ui.heading}>RollersMaps</Text></View>
        <Pressable accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }} onPress={() => back ? router.back() : isSignedIn ? void signOut() : router.push('/auth')}><Text style={ui.accent}>{back ? 'Volver' : isSignedIn ? 'Salir' : 'Ingresar'}</Text></Pressable></View>
      <View style={{ gap: 6 }}><Text style={ui.title}>{title}</Text>{subtitle ? <Text style={ui.muted}>{subtitle}</Text> : null}</View>{children}
    </ScrollView>
  </SafeAreaView></View>;
}
export function Button({ children, onPress, secondary, disabled, busy }: { children: string; onPress: () => void; secondary?: boolean; disabled?: boolean; busy?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress} style={[ui.button, secondary && ui.secondary, (disabled || busy) && ui.disabled]}>{busy ? <ActivityIndicator color={secondary ? '#FFFFFF' : '#17110C'} /> : <Text style={[ui.buttonText, secondary && ui.secondaryText]}>{children}</Text>}</Pressable>;
}
export function Card({ children }: { children: ReactNode }) { return <View style={ui.card}>{children}</View>; }
export function Notice({ title, text, action, onAction }: { title: string; text?: string; action?: string; onAction?: () => void }) {
  return <Card><Text style={ui.heading}>{title}</Text>{text ? <Text style={ui.muted}>{text}</Text> : null}{action && onAction ? <Button secondary onPress={onAction}>{action}</Button> : null}</Card>;
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={{ gap: 7 }}><Text style={ui.text}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor="#788595" {...props} style={[ui.input, props.multiline && { minHeight: 90 }, props.style]} /></View>;
}
