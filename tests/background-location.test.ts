import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrackingSnapshot } from '../src/lib/tracking-store';

const holder = vi.hoisted(() => ({
  snapshot: null as TrackingSnapshot | null,
  active: false,
  note: vi.fn<() => Promise<void>>(),
  start: vi.fn<() => Promise<void>>(),
  stop: vi.fn<() => Promise<void>>(),
}));
vi.mock('@/lib/tracking-store', () => ({
  BACKGROUND_LOCATION_TASK: 'test-location', appendLocationBatch: vi.fn(), reportTrackingError: vi.fn(),
  getTrackingSnapshot: (ownerId?: string) => holder.snapshot && (!ownerId || holder.snapshot.userId === ownerId) ? holder.snapshot : null,
  noteTrackingInterruption: holder.note,
}));
vi.mock('expo-task-manager', () => ({ isTaskDefined: () => true }));
vi.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 6 }, ActivityType: { Fitness: 'fitness' },
  hasStartedLocationUpdatesAsync: async () => holder.active,
  startLocationUpdatesAsync: holder.start,
  stopLocationUpdatesAsync: holder.stop,
}));
let service: typeof import('../src/tasks/background-location');
function snapshot(owner = 'account-a', recordId = 'record-a', segment = 0): TrackingSnapshot {
  return { recordId, userId: owner, status: 'active', title: 'Ruta', activityType: 'free_route', groupActivityId: null,
    startedAt: 1, endedAt: null, averageSpeedKmh: 0, distanceKm: 0, durationSeconds: 0, rejectedPoints: 0,
    route: [{ latitude: -33, longitude: -70, timestamp: segment + 1, accuracy: 5, reportedSpeedKmh: null, segment }] };
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(async () => {
  vi.resetModules(); holder.snapshot = snapshot(); holder.active = false;
  holder.note.mockReset().mockResolvedValue();
  holder.start.mockReset().mockImplementation(async () => { holder.active = true; });
  holder.stop.mockReset().mockImplementation(async () => { holder.active = false; });
  service = await import('../src/tasks/background-location');
});

describe('Ciclo del GPS con proveedor diferido', () => {
  it('stop invalida una restauración que todavía espera la recuperación del store', async () => {
    const gate = deferred(); holder.note.mockReturnValue(gate.promise);
    const starting = service.startActiveLocationService('account-a');
    const rejected = expect(starting).rejects.toThrow(/detenido/);
    await vi.waitFor(() => expect(holder.note).toHaveBeenCalledOnce());
    const stopping = service.stopActiveLocationService(); holder.snapshot!.status = 'paused';
    gate.resolve(); await rejected; await stopping;
    expect(holder.start).not.toHaveBeenCalled(); expect(holder.active).toBe(false);
  });
  it('stop espera un start nativo pendiente y deja el proveedor detenido al resolver', async () => {
    const gate = deferred(); holder.start.mockImplementation(async () => { await gate.promise; holder.active = true; });
    const starting = service.startActiveLocationService('account-a');
    const rejected = expect(starting).rejects.toThrow(/detenido/);
    await vi.waitFor(() => expect(holder.start).toHaveBeenCalledOnce());
    let stopped = false; const stopping = service.stopActiveLocationService().then(() => { stopped = true; });
    holder.snapshot = null; await Promise.resolve(); expect(stopped).toBe(false);
    gate.resolve(); await rejected; await stopping;
    expect(holder.stop).toHaveBeenCalledOnce(); expect(holder.active).toBe(false);
  });
  it.each(['owner', 'record', 'paused'] as const)('revalida sesión después de esperar el store: %s', async change => {
    const gate = deferred(); holder.note.mockReturnValue(gate.promise);
    const starting = service.startActiveLocationService('account-a');
    const rejected = expect(starting).rejects.toThrow(/detenido/);
    await vi.waitFor(() => expect(holder.note).toHaveBeenCalledOnce());
    if (change === 'owner') holder.snapshot = snapshot('account-b');
    else if (change === 'record') holder.snapshot = snapshot('account-a', 'another-record');
    else holder.snapshot!.status = 'paused';
    gate.resolve(); await rejected; expect(holder.start).not.toHaveBeenCalled();
  });
  it('dos restauraciones simultáneas registran sólo un proveedor', async () => {
    await Promise.all([service.startActiveLocationService('account-a'), service.startActiveLocationService('account-a')]);
    expect(holder.start).toHaveBeenCalledOnce(); expect(holder.active).toBe(true);
  });
  it('tras reabrir reactiva la tarea registrada aunque el estado nativo diga que ya existe', async () => {
    holder.active = true;
    await service.startActiveLocationService('account-a');
    expect(holder.start).toHaveBeenCalledOnce(); expect(holder.active).toBe(true);
  });
  it('un segmento detenido no se reinicia automáticamente; reanudar otro segmento sí', async () => {
    await service.startActiveLocationService('account-a'); await service.stopActiveLocationService();
    await expect(service.startActiveLocationService('account-a')).rejects.toThrow(/detenido/);
    holder.snapshot = snapshot('account-a', 'record-a', 1); await service.startActiveLocationService('account-a');
    expect(holder.start).toHaveBeenCalledTimes(2); expect(holder.active).toBe(true);
  });
  it('una cola fallida permite detener el proveedor y reintentar tras reanudar', async () => {
    holder.start.mockRejectedValueOnce(new Error('Native unavailable'));
    await expect(service.startActiveLocationService('account-a')).rejects.toThrow(/Native/);
    await service.stopActiveLocationService(); holder.snapshot = snapshot('account-a', 'record-a', 1);
    await service.startActiveLocationService('account-a'); expect(holder.active).toBe(true);
  });
  it('limpia una tarea parcialmente registrada cuando el inicio nativo falla', async () => {
    holder.start.mockImplementationOnce(async () => { holder.active = true; throw new Error('Foreground unavailable'); });
    await expect(service.startActiveLocationService('account-a')).rejects.toThrow(/Foreground/);
    expect(holder.stop).toHaveBeenCalledOnce(); expect(holder.active).toBe(false);
  });
  it('un dueño diferente o una sesión ausente nunca empieza la adquisición', async () => {
    await expect(service.startActiveLocationService('account-b')).rejects.toThrow(/detenido/);
    holder.snapshot = null; await expect(service.startActiveLocationService('account-a')).rejects.toThrow(/detenido/);
    expect(holder.start).not.toHaveBeenCalled();
  });
});
