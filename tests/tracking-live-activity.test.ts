import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrackingSnapshot } from '@/lib/tracking-store';
const holder = vi.hoisted(() => ({ snapshot: null as TrackingSnapshot | null, instances: [] as { update: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }[], start: vi.fn() }));
vi.mock('@/widgets/SkatingActivity.ios', () => ({ default: { getInstances: () => holder.instances, start: holder.start } }));
vi.mock('@/lib/tracking-store', () => ({ getTrackingSnapshot: () => holder.snapshot }));
beforeEach(() => {
  vi.resetModules(); holder.instances = []; holder.start.mockReset();
  holder.snapshot = { recordId: 'one', status: 'active', gpsStatus: 'ready', durationSeconds: 10, distanceKm: 1, route: [] } as unknown as TrackingSnapshot;
});
describe('Ciclo de la tarjeta iOS', () => {
  it('el trabajo en segundo plano no crea nuevas tarjetas sin inicio explícito', async () => {
    const live = await import('@/lib/tracking-live-activity.ios');
    await live.syncTrackingLiveActivity(); expect(holder.start).not.toHaveBeenCalled();
    await live.syncTrackingLiveActivity({ allowStart: true, force: true }); expect(holder.start).toHaveBeenCalledOnce();
  });
  it('recupera una instancia existente y no la duplica al reabrir', async () => {
    const instance = { update: vi.fn().mockResolvedValue(undefined), end: vi.fn().mockResolvedValue(undefined) };
    holder.instances = [instance]; const live = await import('@/lib/tracking-live-activity.ios');
    await live.syncTrackingLiveActivity({ allowStart: true }); await live.syncTrackingLiveActivity();
    expect(instance.update).toHaveBeenCalledOnce(); expect(holder.start).not.toHaveBeenCalled();
  });
  it('finalizar o descartar retira la tarjeta y un error del sistema no rompe el GPS', async () => {
    const instance = { update: vi.fn().mockRejectedValue(new Error('disabled')), end: vi.fn().mockResolvedValue(undefined) };
    holder.instances = [instance]; const live = await import('@/lib/tracking-live-activity.ios');
    await expect(live.syncTrackingLiveActivity()).resolves.toBeUndefined();
    holder.snapshot = null; await live.syncTrackingLiveActivity(); expect(instance.end).toHaveBeenCalledWith('immediate');
  });
});
