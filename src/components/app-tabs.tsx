import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { useDemoSession } from '@/contexts/demo-session';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const { isSignedIn } = useDemoSession();

  return (
    <NativeTabs
      backBehavior="history"
      backgroundColor={colors.background}
      hidden={!isSignedIn}
      iconColor={{ default: '#A8A8A8', selected: '#FF7900' }}
      indicatorColor="#2A2019"
      labelStyle={{ default: { color: '#A8A8A8', fontSize: 11, fontWeight: '700' }, selected: { color: '#FF9A45', fontSize: 11, fontWeight: '900' } }}
      labelVisibilityMode="labeled">
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Inicio</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="home" sf={{ default: 'house', selected: 'house.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="calendar">
        <NativeTabs.Trigger.Label>Calendario</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="calendar_month" sf={{ default: 'calendar', selected: 'calendar' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="explore">
        <NativeTabs.Trigger.Label>Rutas</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="map" sf={{ default: 'map', selected: 'map.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="my-activities">
        <NativeTabs.Trigger.Label>Mis actividades</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="directions_run" sf={{ default: 'list.bullet.clipboard', selected: 'list.bullet.clipboard.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="+not-found" hidden />
    </NativeTabs>
  );
}
