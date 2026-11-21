import { syncTrackingLiveActivity, endTrackingLiveActivity } from '@/lib/tracking-live-activity';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { appendLocationBatch, BACKGROUND_LOCATION_TASK, getTrackingSnapshot, noteTrackingInterruption, reportTrackingError, type TrackingSnapshot } from '@/lib/tracking-store';

type LocationTaskData = { locations: Location.LocationObject[] };
type SessionIdentity = { recordId: string; userId: string; segment: number };
let serviceQueue: Promise<void> = Promise.resolve();
let serviceGeneration = 0;
let stoppedSession: SessionIdentity | null = null;
let lastStartedSession: SessionIdentity | null = null;

function identityOf(snapshot: TrackingSnapshot): SessionIdentity {
  return { recordId: snapshot.recordId, userId: snapshot.userId, segment: snapshot.route.at(-1)?.segment ?? 0 };
}
function sameSession(left: SessionIdentity | null, right: SessionIdentity) {
  return left?.recordId === right.recordId && left.userId === right.userId && left.segment === right.segment;
}
function enqueueService(operation: () => Promise<void>) {
  const result = serviceQueue.then(operation);
  serviceQueue = result.then(() => undefined, () => undefined);
  return result;
}
function sessionIsActive(expected: SessionIdentity, generation: number) {
  const current = getTrackingSnapshot(expected.userId);
  return generation === serviceGeneration && current?.status === 'active' && sameSession(identityOf(current), expected);
}
function changedSessionError() { const error = new Error('El recorrido cambió o está detenido. Reanuda desde su pantalla para continuar.'); error.name = 'LocationServiceCancelledError'; return error; }
export function isLocationServiceCancellation(error: unknown) { return error instanceof Error && error.name === 'LocationServiceCancelledError'; }

if (!TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK)) {
  TaskManager.defineTask<LocationTaskData>(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    if (error) { await reportTrackingError(); await syncTrackingLiveActivity({ force: true }); return; }
    if (!data?.locations?.length) return;
    try { await appendLocationBatch(data.locations); await syncTrackingLiveActivity(); }
    catch {
      // The store keeps the failed batch. Stop acquiring until storage can recover.
      try { await stopActiveLocationService(); } catch { /* The visible store error still explains the interruption. */ }
    }
  });
}

export async function hasActiveLocationService() {
  return Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
}

export function startActiveLocationService(ownerId?: string) {
  const snapshot = getTrackingSnapshot(ownerId);
  if (!snapshot || snapshot.status !== 'active' || (ownerId && snapshot.userId !== ownerId)) return Promise.reject(changedSessionError());
  const expected = identityOf(snapshot), generation = serviceGeneration;
  return enqueueService(async () => {
    if (sameSession(stoppedSession, expected) || !sessionIsActive(expected, generation)) throw changedSessionError();
    await noteTrackingInterruption();
    if (!sessionIsActive(expected, generation)) throw changedSessionError();
    const alreadyStarted = await hasActiveLocationService();
    if (!sessionIsActive(expected, generation)) throw changedSessionError();
    // Registration survives a process restart; only starts confirmed in this
    // module can be reused. Reopening must still reactivate the native service.
    try {
      if (!alreadyStarted || !sameSession(lastStartedSession, expected)) await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
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
    } catch (error) {
      // A provider can register a task before rejecting its foreground startup.
      if (await hasActiveLocationService()) await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      throw error;
    }
    if (!sessionIsActive(expected, generation)) {
      // Stop directly inside this operation; enqueueing stop here would deadlock.
      if (await hasActiveLocationService()) await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      throw changedSessionError();
    }
    lastStartedSession = expected;
    stoppedSession = null;
  });
}

export function stopActiveLocationService(options: { keepLiveActivity?: boolean } = {}) {
  serviceGeneration++;
  // A delayed automatic restore must not restart a segment stopped by the user.
  // Resuming creates a new segment, which is eligible for a new explicit start.
  try { const snapshot = getTrackingSnapshot(); stoppedSession = snapshot ? identityOf(snapshot) : lastStartedSession; }
  catch { stoppedSession = lastStartedSession; } // Stopping GPS must also work if SQLite cannot be read.
  return enqueueService(async () => {
    if (await hasActiveLocationService()) await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (!options.keepLiveActivity) await endTrackingLiveActivity();
  });
}
