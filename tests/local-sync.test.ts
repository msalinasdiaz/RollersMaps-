import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), deleteLocalActivityAsync: vi.fn(), deleteQuery: vi.fn(), getPendingLocalActivitiesAsync: vi.fn(), getLocalActivities: vi.fn(),
  claimLocalActivityAsync: vi.fn(), markLocalActivitySyncedAsync: vi.fn(), upsert: vi.fn(), single: vi.fn(), abortSignal: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: mocks.getSession }, from: () => ({ upsert: mocks.upsert, delete: mocks.deleteQuery }) } }));
vi.mock('@/lib/tracking-store', () => ({ ...mocks, GUEST_OWNER: 'guest' }));
const record = (ownerId = 'alice', recordId = 'stable-route-id', cloudId: string | null = null) => ({ ownerId, cloudId, snapshot: {
  recordId, title: 'Salida libre', activityType: 'free_route', groupActivityId: null, startedAt: 1800000000000,
  endedAt: 1800000060000, durationSeconds: 60, distanceKm: .2, averageSpeedKmh: 12,
  route: [{ longitude: -70, latitude: -33 }, { longitude: -70.002, latitude: -33 }],
} });
let records: ReturnType<typeof record>[];
beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks(); records = [record()];
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'alice' } } }, error: null });
  mocks.getPendingLocalActivitiesAsync.mockImplementation(async (owner: string, guests: boolean, limit: number) => records.filter(r => !r.cloudId && (r.ownerId === owner || guests && r.ownerId === 'guest')).slice(0, limit));
  mocks.markLocalActivitySyncedAsync.mockImplementation(async (id: string, owner: string, cloud: string) => { const item = records.find(r => r.snapshot.recordId === id && r.ownerId === owner); if (item) item.cloudId = cloud; });
  mocks.claimLocalActivityAsync.mockImplementation(async (id: string, owner: string) => { const item = records.find(r => r.snapshot.recordId === id && r.ownerId === 'guest'); if (item) item.ownerId = owner; });
  mocks.single.mockResolvedValue({ data: { id: 'cloud-id' }, error: null, status: 200 });
  mocks.abortSignal.mockReturnValue({ single: mocks.single });
  mocks.upsert.mockReturnValue({ select: () => ({ abortSignal: mocks.abortSignal }) });
});
describe('Respaldo pendiente por identidad y reintentos', () => {
  it('respalda la velocidad máxima con la geometría y mantiene la identidad del recorrido', async () => {
    Object.assign(records[0].snapshot.route[0], { reportedSpeedKmh: 12 });
    Object.assign(records[0].snapshot.route[1], { reportedSpeedKmh: 24.3 });
    const { syncLocalActivities } = await import('@/lib/local-sync');
    expect(await syncLocalActivities('alice')).toBeNull();
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'alice', client_record_id: 'stable-route-id',
      route_geojson: { type: 'LineString', coordinates: [[-70, -33], [-70.002, -33]], maximumSpeedKmh: 24.3, topSpeedsKmh: [24.3, 12] },
    }), { onConflict: 'user_id,client_record_id' });
  });
  it('deduplica llamadas de una cuenta y nunca lee el historial completo', async () => {
    const { syncLocalActivities } = await import('@/lib/local-sync');
    const first = syncLocalActivities('alice'), second = syncLocalActivities('alice');
    expect(first).toBe(second); expect(await first).toBeNull();
    expect(mocks.upsert).toHaveBeenCalledTimes(1); expect(mocks.getLocalActivities).not.toHaveBeenCalled();
    expect(mocks.getPendingLocalActivitiesAsync).toHaveBeenCalledWith('alice', false, 20);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'alice', client_record_id: 'stable-route-id' }), { onConflict: 'user_id,client_record_id' });
    expect(mocks.markLocalActivitySyncedAsync).toHaveBeenCalledWith('stable-route-id', 'alice', 'cloud-id');
  });
  it('no reclama invitados sin petición explícita', async () => {
    records = [record('guest')]; const { syncLocalActivities } = await import('@/lib/local-sync');
    await syncLocalActivities('alice'); expect(mocks.upsert).not.toHaveBeenCalled(); expect(mocks.claimLocalActivityAsync).not.toHaveBeenCalled();
    await syncLocalActivities('alice', true); expect(mocks.claimLocalActivityAsync).toHaveBeenCalledWith('stable-route-id', 'alice');
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });
  it('no mezcla el resultado de dos cuentas', async () => {
    records.push(record('bob', 'bob-route'));
    const { syncLocalActivities } = await import('@/lib/local-sync');
    const first = syncLocalActivities('alice'), second = syncLocalActivities('bob');
    expect(first).not.toBe(second); expect(await second).toMatch(/sesión cambió/); expect(await first).toBeNull();
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });
  it('reintenta un fallo transitorio con la misma clave sin duplicar rutas', async () => {
    mocks.single.mockResolvedValueOnce({ data: null, error: { message: 'offline' }, status: 0 });
    const { syncLocalActivities } = await import('@/lib/local-sync'); expect(await syncLocalActivities('alice')).toBeNull();
    expect(mocks.upsert.mock.calls.map(c => c[0].client_record_id)).toEqual(['stable-route-id', 'stable-route-id']);
    expect(mocks.markLocalActivitySyncedAsync).toHaveBeenCalledTimes(1);
  });
  it('un error permanente conserva pendientes y no insiste con backoff', async () => {
    mocks.single.mockResolvedValue({ data: null, error: { code: '42501', message: 'policy' }, status: 403 });
    const { syncLocalActivities } = await import('@/lib/local-sync'); expect(await syncLocalActivities('alice')).toMatch(/siguen guardados/);
    expect(mocks.upsert).toHaveBeenCalledTimes(1); expect(mocks.markLocalActivitySyncedAsync).not.toHaveBeenCalled();
    mocks.single.mockResolvedValue({ data: { id: 'cloud-id' }, error: null, status: 200 });
    expect(await syncLocalActivities('alice')).toBeNull();
  });
  it('reintenta un 503 con código PostgREST sin perder la identidad estable', async () => {
    mocks.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST003', message: 'Database unavailable' }, status: 503 });
    const { syncLocalActivities } = await import('@/lib/local-sync'); expect(await syncLocalActivities('alice')).toBeNull();
    expect(mocks.upsert).toHaveBeenCalledTimes(2); expect(mocks.markLocalActivitySyncedAsync).toHaveBeenCalledTimes(1);
  });
  it('no marca el respaldo ni envía el siguiente si cambia la cuenta después del envío', async () => {
    records.push(record('alice', 'second-route'));
    mocks.getSession.mockResolvedValueOnce({ data: { session: { user: { id: 'alice' } } }, error: null })
      .mockResolvedValueOnce({ data: { session: { user: { id: 'bob' } } }, error: null });
    const { syncLocalActivities } = await import('@/lib/local-sync'); expect(await syncLocalActivities('alice')).toMatch(/sesión cambió/);
    expect(mocks.upsert).toHaveBeenCalledTimes(1); expect(mocks.markLocalActivitySyncedAsync).not.toHaveBeenCalled();
  });
  it('continúa en lotes y omite respaldados aunque existan miles', async () => {
    records = Array.from({ length: 1000 }, (_, i) => record('alice', 'saved-' + i, 'cloud-' + i));
    records.push(...Array.from({ length: 45 }, (_, i) => record('alice', 'pending-' + i)));
    const { syncLocalActivities } = await import('@/lib/local-sync'); expect(await syncLocalActivities('alice')).toBeNull();
    expect(mocks.upsert).toHaveBeenCalledTimes(45);
    expect(mocks.getPendingLocalActivitiesAsync).toHaveBeenCalledTimes(4);
    expect(mocks.upsert.mock.calls.every(call => call[0].client_record_id.startsWith('pending-'))).toBe(true);
  });
});

it('waits for an ongoing upload before deleting a pending record by its stable client ID', async () => {
  const eq = vi.fn().mockReturnThis();
  const abortSignal = vi.fn().mockResolvedValue({error: null});
  mocks.deleteQuery.mockReturnValue({eq, abortSignal});
  const {syncLocalActivities, deleteRecordedRoute} = await import('@/lib/local-sync');
  await Promise.all([syncLocalActivities('alice'), deleteRecordedRoute('alice', {localId: 'stable-route-id'})]);
  expect(mocks.markLocalActivitySyncedAsync.mock.invocationCallOrder[0]).toBeLessThan(mocks.deleteQuery.mock.invocationCallOrder[0]);
  expect(eq.mock.calls).toEqual([['user_id', 'alice'], ['client_record_id', 'stable-route-id']]);
  expect(mocks.deleteLocalActivityAsync).toHaveBeenCalledWith('alice', 'stable-route-id', null);
});
it('preserves the local copy if deleting the backup fails', async () => {
  mocks.deleteQuery.mockReturnValue({eq: vi.fn().mockReturnThis(), abortSignal: vi.fn().mockResolvedValue({error: new Error('offline')})});
  const {deleteRecordedRoute} = await import('@/lib/local-sync');
  await expect(deleteRecordedRoute('alice', {cloudId: 'cloud-id', localId: 'record'})).rejects.toThrow('offline');
  expect(mocks.deleteLocalActivityAsync).not.toHaveBeenCalled();
});
