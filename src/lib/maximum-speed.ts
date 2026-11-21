import type { RouteCoordinate } from './route-geometry';

type SpeedPoint = RouteCoordinate & { timestamp?: number; reportedSpeedKmh?: number | null; accuracy?: number | null };
const validSpeed = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 55;

/** Missing historic timing is unknown, never an invented zero or a GPS spike. */
export function topSpeedsKmh(route: SpeedPoint[]): number[] {
  const peaks: number[] = [];
  for (let i = 0; i < route.length; i++) {
    const point = route[i], previous = route[i - 1];
    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) continue;
    if (point.accuracy != null && (!Number.isFinite(point.accuracy) || point.accuracy > 50 || point.accuracy < 0)) continue;
    let speed = point.reportedSpeedKmh;
    if (speed == null && previous && (point.segment ?? 0) === (previous.segment ?? 0)) {
      const elapsed = (point.timestamp ?? NaN) - (previous.timestamp ?? NaN);
      if (elapsed <= 0 || elapsed > 30000 || !Number.isFinite(elapsed)) continue;
      if (previous.accuracy != null && previous.accuracy > 50) continue;
      const rad = Math.PI / 180;
      const x = (point.longitude - previous.longitude) * rad * Math.cos((point.latitude + previous.latitude) * rad / 2);
      const y = (point.latitude - previous.latitude) * rad;
      const meters = Math.hypot(x, y) * 6371000;
      if (meters > 250) continue;
      speed = meters / elapsed * 3600;
    }
    if (validSpeed(speed) && (peaks.length < 3 || speed > peaks[2])) {
      peaks.push(speed);
      peaks.sort((a, b) => b - a);
      if (peaks.length > 3) peaks.pop();
    }
  }
  return peaks;
}

export function maximumSpeedKmh(route: SpeedPoint[]): number | null {
  return topSpeedsKmh(route)[0] ?? null;
}

export function readTopSpeeds(geometry: unknown): number[] {
  if (geometry && typeof geometry === 'object' && 'topSpeedsKmh' in geometry && Array.isArray(geometry.topSpeedsKmh)) {
    const peaks = geometry.topSpeedsKmh.filter(validSpeed).sort((a, b) => b - a).slice(0, 3);
    if (peaks.length) return peaks;
  }
  const peak = readMaximumSpeed(geometry);
  return peak === null ? [] : [peak];
}

export function readMaximumSpeed(geometry: unknown): number | null {
  if (!geometry || typeof geometry !== 'object' || !('maximumSpeedKmh' in geometry)) return null;
  return validSpeed(geometry.maximumSpeedKmh) ? geometry.maximumSpeedKmh : null;
}

export function formatMaximumSpeed(speed: number | null | undefined): string {
  return validSpeed(speed) ? speed.toFixed(1).replace('.', ',') : '—';
}
