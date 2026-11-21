import type { TrackingSnapshot } from './tracking-store';
import { currentSpeedKmh, formatTrackingTime } from './tracking-metrics';

export function liveActivityState(snapshot: TrackingSnapshot, now = Date.now()) {
  const running = snapshot.status === 'active' && (!snapshot.gpsStatus || snapshot.gpsStatus === 'ready');
  return {
    // Do not expose the route, coordinates or the user's custom title on the lock screen.
    status: snapshot.status === 'paused' ? 'En pausa' : running ? 'Patinaje en línea' : 'Buscando señal GPS',
    distance: snapshot.distanceKm.toFixed(2).replace('.', ','),
    speed: (running ? currentSpeedKmh(snapshot, now) : 0).toFixed(1).replace('.', ','),
    duration: formatTrackingTime(snapshot.durationSeconds),
    running,
    timerStart: now - snapshot.durationSeconds * 1000,
    // Stop the native timer when no fresh fix has arrived for 30 seconds.
    timerEnd: Math.max(now, (snapshot.lastReceivedAt ?? now) + 30000),
  };
}
