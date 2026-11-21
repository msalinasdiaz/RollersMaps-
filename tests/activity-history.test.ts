import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTIVITY_SUMMARY_COLUMNS, cloudActivityDetail, cloudActivityPage, mergeActivitySummaries, type UserActivitySummary } from '@/lib/activity-history';
const mocks = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn(), abortSignal: vi.fn(), maybeSingle: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: mocks.from } }));
const summary = (id: string, cloudId: string | null = null): UserActivitySummary => ({ id, cloudId, localId: 'client-1', activityType: 'free_route',
  averageSpeedKmh: 8, distanceKm: 1, durationSeconds: 500, endedAt: new Date(1800000500000), groupActivityId: null,
  hasRoute: true, startedAt: new Date(1800000000000), syncStatus: cloudId ? 'synced' : 'pending', title: 'Ruta' });
let response: { data: unknown; error: unknown };
beforeEach(() => {
  vi.resetAllMocks(); response = { data: [], error: null };
  const query = { select: mocks.select, eq: mocks.eq, order: mocks.order, range: mocks.range, abortSignal: mocks.abortSignal,
    maybeSingle: mocks.maybeSingle, then: (resolve: (value: unknown) => unknown) => Promise.resolve(response).then(resolve) };
  for (const fn of [mocks.from, mocks.select, mocks.eq, mocks.order, mocks.range, mocks.abortSignal]) fn.mockReturnValue(query);
  mocks.maybeSingle.mockImplementation(async () => response);
});
describe('Historial paginado sin geometría', () => {
  it('recupera el máximo guardado en la geometría sin exigir una migración ni inventar históricos', async () => {
    response.data = { route_geojson: { type: 'LineString', coordinates: [[-70, -33], [-70.01, -33]], maximumSpeedKmh: 24.3 } };
    const detail = await cloudActivityDetail('alice', summary('cloud-1', 'cloud-1'));
    expect(detail?.maximumSpeedKmh).toBe(24.3);
    response.data = { route_geojson: { type: 'LineString', coordinates: [[-70, -33], [-70.01, -33]] } };
    expect((await cloudActivityDetail('alice', summary('cloud-1', 'cloud-1')))?.maximumSpeedKmh).toBeNull();
  });
  it('accede a la sexta página sin seleccionar ni parsear rutas', async () => {
    response.data = Array.from({ length: 21 }, (_, i) => ({ id: 'cloud-' + (100 + i), client_record_id: null, title: 'Ruta', activity_type: 'free_route',
      group_activity_id: null, average_speed_kmh: 5, distance_km: 1, duration_seconds: 700, started_at: '2026-10-01T12:00:00Z', ended_at: '2026-10-01T12:12:00Z',
      get route_geojson() { throw new Error('Geometry must not be read in a list'); } }));
    const page = await cloudActivityPage('alice', 100);
    expect(mocks.select).toHaveBeenCalledWith(ACTIVITY_SUMMARY_COLUMNS); expect(ACTIVITY_SUMMARY_COLUMNS).not.toContain('route_geojson');
    expect(mocks.eq).toHaveBeenCalledWith('user_id', 'alice'); expect(mocks.range).toHaveBeenCalledWith(100, 120);
    expect(page.activities).toHaveLength(20); expect(page.hasMore).toBe(true);
    expect(page.activities[0]).not.toHaveProperty('route');
  });
  it('carga una geometría puntual y filtra por propietario e identidad', async () => {
    response.data = { route_geojson: { type: 'LineString', coordinates: [[-70, -33], [-70.01, -33]] } };
    const detail = await cloudActivityDetail('alice', summary('cloud-1', 'cloud-1'));
    expect(mocks.select).toHaveBeenCalledWith('route_geojson'); expect(mocks.eq).toHaveBeenCalledWith('user_id', 'alice');
    expect(mocks.eq).toHaveBeenCalledWith('id', 'cloud-1'); expect(detail?.route).toHaveLength(2);
  });
  it('fusiona pendientes y nube por client_record_id sin duplicados ni pérdida de disponibilidad', () => {
    const merged = mergeActivitySummaries([summary('local:client-1')], [{ ...summary('cloud-1', 'cloud-1'), hasRoute: null }]);
    expect(merged).toHaveLength(1); expect(merged[0]).toMatchObject({ id: 'cloud-1', hasRoute: true, localId: 'client-1' });
  });
  it('propaga errores de respaldo para mostrar reintento sin borrar páginas anteriores', async () => {
    response.error = { message: 'offline' }; await expect(cloudActivityPage('alice', 0)).rejects.toMatchObject({ message: 'offline' });
  });
  it('fusiona una copia antigua sin client_record_id por su identidad de nube', () => {
    const cloud = { ...summary('cloud-1', 'cloud-1'), localId: undefined, hasRoute: null };
    const local = summary('cloud-1', 'cloud-1');
    for (const pages of [[[local], [cloud]], [[cloud], [local]]]) {
      const merged = mergeActivitySummaries(...pages);
      expect(merged).toHaveLength(1);
      expect(merged[0]).toMatchObject({ id: 'cloud-1', localId: 'client-1', hasRoute: true });
    }
  });
  it('une los aliases local y nube aunque lleguen en páginas separadas', () => {
    const cloud = { ...summary('cloud-1', 'cloud-1'), localId: undefined, hasRoute: null };
    const merged = mergeActivitySummaries([summary('local:client-1')], [cloud], [summary('cloud-1', 'cloud-1')]);
    expect(merged).toHaveLength(1); expect(merged[0]).toMatchObject({ id: 'cloud-1', localId: 'client-1', hasRoute: true });
  });
});
