import Constants from 'expo-constants';

import { GoogleTrackingMap } from './tracking-map-google';
import { TrackingMap as OpenTrackingMap, type TrackingMapProps } from './tracking-map-maplibre';

export function TrackingMap(props: TrackingMapProps) {
  return Constants.expoConfig?.extra?.googleMapsAndroidEnabled === true
    ? <GoogleTrackingMap {...props} />
    : <OpenTrackingMap {...props} />;
}

export type { TrackingMapProps } from './tracking-map-maplibre';
