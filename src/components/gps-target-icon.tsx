import { View } from 'react-native';

export function GpsTargetIcon({ color = '#FF7900', size = 32 }: { color?: string; size?: number }) {
  const stroke = Math.max(2, Math.round(size * 0.08));
  const ringSize = size * 0.58;
  const tickLength = size * 0.22;
  const tickThickness = Math.max(2, size * 0.075);

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ alignItems: 'center', height: size, justifyContent: 'center', width: size }}>
      <View style={{ borderColor: color, borderRadius: ringSize / 2, borderWidth: stroke, height: ringSize, width: ringSize }} />
      <View style={{ backgroundColor: color, borderRadius: size * 0.08, height: size * 0.16, position: 'absolute', width: size * 0.16 }} />
      <View style={{ backgroundColor: color, height: tickLength, left: (size - tickThickness) / 2, position: 'absolute', top: 0, width: tickThickness }} />
      <View style={{ backgroundColor: color, bottom: 0, height: tickLength, left: (size - tickThickness) / 2, position: 'absolute', width: tickThickness }} />
      <View style={{ backgroundColor: color, height: tickThickness, left: 0, position: 'absolute', top: (size - tickThickness) / 2, width: tickLength }} />
      <View style={{ backgroundColor: color, height: tickThickness, position: 'absolute', right: 0, top: (size - tickThickness) / 2, width: tickLength }} />
    </View>
  );
}
