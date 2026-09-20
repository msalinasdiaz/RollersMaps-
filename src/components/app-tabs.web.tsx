import { TabList, TabSlot, Tabs, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, Text } from 'react-native';

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={styles.slot} />
      <TabList style={styles.tabList}>
        <TabTrigger asChild href="/" name="index"><TabButton>Inicio</TabButton></TabTrigger>
        <TabTrigger asChild href="/calendar" name="calendar"><TabButton>Calendario</TabButton></TabTrigger>
        <TabTrigger asChild href="/groups" name="groups"><TabButton>Grupos</TabButton></TabTrigger>
        <TabTrigger asChild href={'/my-activities' as never} name="my-activities"><TabButton>Mis rutas</TabButton></TabTrigger>
      </TabList>
    </Tabs>
  );
}

function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  return (
    <Pressable {...props} style={[styles.tabButton, isFocused && styles.tabButtonActive]}>
      <Text style={[styles.tabText, isFocused && styles.tabTextActive]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  slot: { height: '100%' },
  tabList: { alignItems: 'center', backgroundColor: '#101010', borderTopColor: '#2B2B2B', borderTopWidth: 1, bottom: 0, flexDirection: 'row', gap: 3, justifyContent: 'center', left: 0, padding: 10, position: 'absolute', right: 0 },
  tabButton: { alignItems: 'center', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 9 },
  tabButtonActive: { backgroundColor: '#2A2019' },
  tabText: { color: '#A8A8A8', fontSize: 12, fontWeight: '800' },
  tabTextActive: { color: '#FF9A45' },
});
