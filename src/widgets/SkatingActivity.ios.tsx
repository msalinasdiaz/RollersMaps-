import { HStack, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, padding } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';
import type { liveActivityState } from '../lib/live-activity-state';

type Props = ReturnType<typeof liveActivityState>;
const SkatingLayout = (props: Props, environment: LiveActivityEnvironment) => {
  'widget';
  const speed = environment.isStale ? '—' : props.speed;
  const status = environment.isStale && props.running ? 'Esperando señal GPS' : props.status;
  return {
    banner: <VStack spacing={10} modifiers={[padding({ all: 14 })]}>
      <Text modifiers={[font({ size: 14, weight: 'semibold' }), foregroundStyle('#FF7900')]}>{'RollersMaps · ' + status}</Text>
      <HStack spacing={22}>
        <VStack spacing={3}>
          {props.running
            ? <Text countsDown={false} timerInterval={{ lower: new Date(props.timerStart), upper: new Date(props.timerEnd) }} modifiers={[font({ size: 24, weight: 'bold' })]} />
            : <Text modifiers={[font({ size: 24, weight: 'bold' })]}>{props.duration}</Text>}
          <Text modifiers={[font({ size: 11 })]}>Duración</Text>
        </VStack>
        <VStack spacing={3}><Text modifiers={[font({ size: 28, weight: 'bold' })]}>{speed}</Text><Text modifiers={[font({ size: 11 })]}>Velocidad · km/h</Text></VStack>
        <VStack spacing={3}><Text modifiers={[font({ size: 24, weight: 'bold' })]}>{props.distance}</Text><Text modifiers={[font({ size: 11 })]}>Distancia · km</Text></VStack>
      </HStack>
    </VStack>,
    compactLeading: <Text modifiers={[foregroundStyle('#FF7900')]}>RM</Text>,
    compactTrailing: <Text>{props.distance + ' km'}</Text>,
    minimal: <Text modifiers={[foregroundStyle('#FF7900')]}>RM</Text>,
    expandedCenter: <Text>{'RollersMaps · ' + status}</Text>,
    expandedBottom: <Text>{props.duration + '  ·  ' + speed + ' km/h  ·  ' + props.distance + ' km'}</Text>,
  };
};
export default createLiveActivity('RollersMapsSkating', SkatingLayout);
