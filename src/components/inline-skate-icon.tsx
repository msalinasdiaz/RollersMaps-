import { Image } from 'expo-image';
// Pictogrammers Material Design Icons, Apache-2.0. See assets/licenses/mdi-LICENSE.txt.
export function InlineSkateIcon({ color = '#FF9A45', size = 32 }: { color?: string; size?: number }) {
  return <Image source={require('../../assets/icons/rollerblade.svg')} style={{ width:size,height:size }} tintColor={color} contentFit="contain" accessible={false} />;
}
