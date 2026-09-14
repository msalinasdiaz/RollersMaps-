import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { appendLocationBatch, BACKGROUND_LOCATION_TASK } from '@/lib/tracking-store';

type LocationTaskData = { locations: Location.LocationObject[] };

if (!TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK)) {
  TaskManager.defineTask<LocationTaskData>(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    await appendLocationBatch(data.locations);
  });
}

export async function hasActiveLocationService() {
  return Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
}

export async function startActiveLocationService() {
  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    activityType: Location.ActivityType.Fitness,
    deferredUpdatesDistance: 0,
    deferredUpdatesInterval: 0,
    distanceInterval: 3,
    foregroundService: {
      killServiceOnDestroy: false,
      notificationBody: 'Tu recorrido sigue guardándose aunque RollersMaps esté en segundo plano.',
      notificationColor: '#FF7900',
      notificationTitle: 'RollersMaps · Registro GPS activo',
    },
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    timeInterval: 2000,
  });
}

export async function stopActiveLocationService() {
  if (await hasActiveLocationService()) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }
}
