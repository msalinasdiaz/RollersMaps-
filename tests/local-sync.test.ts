import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), getLocalActivities: vi.fn(), claimLocalActivity: vi.fn(),
  markLocalActivitySynced: vi.fn(), upsert: vi.fn(), single: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({ supabase: {
  auth: { getSession: mocks.getSession },
  from: () => ({ upsert: mocks.upsert }),
} }));
vi.mock('@/lib/tracking-store', () => ({ ...mocks, GUEST_OWNER: 'guest' }));

const record = (ownerId = 'alice') => ({ ownerId, cloudId: null, snapshot: {
  recordId: 'stable-route-id', title: 'Salida libre', activityType: 'free_route', groupActivityId: null,
  startedAt: 1800000000000, endedAt: 1800000060000, durationSeconds: 60,
  distanceKm: .2, averageSpeedKmh: 12, route: [{ longitude: -70, latitude: -33 }, { longitude: -70.002, latitude: -33 }],
} });
beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'alice' } } } });
  mocks.getLocalActivities.mockReturnValue([record()]);
  mocks.single.mockResolvedValue({ data: { id: 'cloud-id' }, error: null });
  mocks.upsert.mockReturnValue({ select: () => ({ single: mocks.single }) });
});
describe('Respaldo local por identidad y reintentos', () => {
  it('comparte un solo envío para llamadas duplicadas y utiliza la identidad estable', async () => {
    const { syncLocalActivities } = await import('@/lib/local-sync');
    const first = syncLocalActivities('alice'), second = syncLocalActivities('alice');
    expect(first).toBe(second); expect(await first).toBeNull();
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'alice', client_record_id: 'stable-route-id' }), { onConflict: 'user_id,client_record_id' });
    expect(mocks.markLocalActivitySynced).toHaveBeenCalledWith('stable-route-id', 'alice', 'cloud-id');
  });
  it('no toma los recorridos de invitado sin una solicitud explícita', async () => {
    mocks.getLocalActivities.mockReturnValue([record('guest')]);
    const { syncLocalActivities } = await import('@/lib/local-sync');
    await syncLocalActivities('alice');
    expect(mocks.upsert).not.toHaveBeenCalled(); expect(mocks.claimLocalActivity).not.toHaveBeenCalled();
    await syncLocalActivities('alice', true);
    expect(mocks.claimLocalActivity).toHaveBeenCalledWith('stable-route-id', 'alice');
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });
  it('una petición para otra cuenta no hereda el resultado de la cuenta anterior', async () => {
    const { syncLocalActivities } = await import('@/lib/local-sync');
    const first = syncLocalActivities('alice'), second = syncLocalActivities('bob');
    expect(first).not.toBe(second);
    expect(await second).toMatch(/sesión cambió/); expect(await first).toBeNull();
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });
  it('un fallo deja el recorrido pendiente y permite reintentar sin duplicar su clave', async () => {
    mocks.single.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    const { syncLocalActivities } = await import('@/lib/local-sync');
    expect(await syncLocalActivities('alice')).toMatch(/siguen guardados/);
    expect(mocks.markLocalActivitySynced).not.toHaveBeenCalled();
    expect(await syncLocalActivities('alice')).toBeNull();
    expect(mocks.upsert.mock.calls.map(c => c[0].client_record_id)).toEqual(['stable-route-id', 'stable-route-id']);
  });
  it('verifica de nuevo la cuenta antes de enviar cada recorrido', async () => {
    mocks.getLocalActivities.mockReturnValue([record(), record()]);
    mocks.getSession.mockResolvedValueOnce({ data: { session: { user: { id: 'alice' } } } }).mockResolvedValueOnce({ data: { session: { user: { id: 'bob' } } } });
    const { syncLocalActivities } = await import('@/lib/local-sync');
    expect(await syncLocalActivities('alice')).toMatch(/sesión cambió/);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });
});
