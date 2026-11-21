import { describe, expect, it } from 'vitest';
import { liveActivityState } from '@/lib/live-activity-state';
import type { TrackingSnapshot } from '@/lib/tracking-store';
const snapshot = { status: 'active', gpsStatus: 'ready', distanceKm: 2.13, durationSeconds: 300, lastReceivedAt: 999000,
  title: 'Casa privada', userId: 'user-id', route: [{ latitude: -33, longitude: -70, timestamp: 999000, reportedSpeedKmh: 12 }] } as TrackingSnapshot;
describe('Tarjeta de pantalla bloqueada', () => {
  it('muestra métricas y no expone título privado, cuenta ni coordenadas', () => {
    const state = liveActivityState(snapshot, 1000000);
    expect(state).toMatchObject({ running: true, duration: '00:05:00', speed: '12,0', distance: '2,13', timerStart: 700000, timerEnd: 1029000 });
    expect(JSON.stringify(state)).not.toMatch(/Casa privada|user-id|latitude|longitude/);
  });
  it('detiene el cronómetro y velocidad en pausa y limita el avance sin señal', () => {
    expect(liveActivityState({ ...snapshot, status: 'paused' }, 1000000)).toMatchObject({ running: false, status: 'En pausa', speed: '0,0' });
    expect(liveActivityState({ ...snapshot, gpsStatus: 'interrupted' }, 1100000)).toMatchObject({ running: false, status: 'Buscando señal GPS', speed: '0,0', timerEnd: 1100000 });
  });
});
