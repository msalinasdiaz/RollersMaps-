import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import type { LocationObject } from 'expo-location';

const holder=vi.hoisted(()=>({db:null as DatabaseSync|null,failPointWrites:false,pointReadRows:[] as number[]}));
vi.mock('expo-sqlite',async()=>{
  const {DatabaseSync}=await import('node:sqlite');
  function open(){
    holder.db??=new DatabaseSync(':memory:');
    const db=holder.db;
    const api={
      execSync:(sql:string)=>db.exec(sql),
      runSync:(sql:string,...args:(string|number|null)[])=>db.prepare(sql).run(...args),
      getAllSync:<T>(sql:string,...args:(string|number|null)[])=>{const rows=db.prepare(sql).all(...args) as T[];if(sql.includes('FROM tracking_points'))holder.pointReadRows.push(rows.length);return rows;},
      getFirstSync:<T>(sql:string,...args:(string|number|null)[])=>db.prepare(sql).get(...args) as T|undefined,
      withTransactionSync:(fn:()=>void)=>{db.exec('BEGIN');try{fn();db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}},
      execAsync:async(sql:string)=>db.exec(sql),
      runAsync:async(sql:string,...args:(string|number|null)[])=>{if(holder.failPointWrites && sql.startsWith('INSERT OR IGNORE INTO tracking_points'))throw new Error('Injected SQLITE_FULL');return db.prepare(sql).run(...args);},
      getAllAsync:async<T>(sql:string,...args:(string|number|null)[])=>db.prepare(sql).all(...args) as T[],
      getFirstAsync:async<T>(sql:string,...args:(string|number|null)[])=>db.prepare(sql).get(...args) as T|undefined,
      withExclusiveTransactionAsync:async(fn:(tx:unknown)=>Promise<void>)=>{db.exec('BEGIN');try{await fn(api);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}},
    };return api;
  }
  return {openDatabaseSync:open,openDatabaseAsync:async()=>open()};
});
let store:typeof import('../src/lib/tracking-store');
const baseTime=1800000000000;
function point(offset=0,seconds=0,accuracy=5):LocationObject{return {timestamp:baseTime+seconds*1000,coords:{latitude:-33+offset,longitude:-70,accuracy,altitude:null,altitudeAccuracy:null,heading:null,speed:2},mocked:false};}
function start(owner='account-a'){store.startLocalTrackingSession({userId:owner,activityType:'free_route',groupActivityId:null,title:'Salida libre',initialLocation:point()});}
function legacyGuest() { start(); holder.db!.exec("UPDATE tracking_session SET user_id='guest'"); }
beforeEach(async()=>{vi.resetModules();vi.spyOn(Date,'now').mockReturnValue(baseTime+10000);holder.failPointWrites=false;holder.pointReadRows=[];store=await import('../src/lib/tracking-store');});
afterEach(()=>{holder.db?.close();holder.db=null;vi.restoreAllMocks();});
describe('GPS y persistencia sobre SQLite real',()=>{
  it('exige una cuenta para iniciar rutas nuevas sin borrar registros previos',()=>{
    expect(()=>start('guest')).toThrow(/Inicia sesión/);
    expect(()=>start('')).toThrow(/Inicia sesión/);
    start('account-a'); const original=store.getTrackingSnapshot()!;
    expect(()=>start('guest')).toThrow(/Inicia sesión/);
    expect(store.getTrackingSnapshot()!.recordId).toBe(original.recordId);
  });
  it('no mezcla rutas antiguas con la cuenta hasta recuperarlas expresamente y conserva sus datos',async()=>{
    legacyGuest(); await store.appendLocationBatch([point(.0001,2)]); store.markTrackingPendingSave();
    const snapshot=store.getTrackingSnapshot()!; store.archiveTrackingSession(snapshot);
    expect(store.getLocalActivities('account-a')).toEqual([]);
    expect(store.getLocalActivities('account-b')).toEqual([]);
    expect(store.getLegacyActivityCount()).toBe(1);
    expect(store.recoverGuestActivities('account-a')).toBe(1);
    const recovered=store.getLocalActivities('account-a')[0];
    expect(recovered.snapshot).toEqual({...snapshot,userId:'account-a'});
    expect(recovered.ownerId).toBe('account-a');
    expect(store.getLocalActivities('account-b')).toEqual([]);
    expect(store.getLegacyActivityCount()).toBe(0);
    expect(store.recoverGuestActivities('account-b')).toBe(0);
  });
  it('recupera rutas antiguas sin red y no permite asignarlas a un invitado',()=>{
    legacyGuest();store.markTrackingPendingSave();store.archiveTrackingSession(store.getTrackingSnapshot()!);
    expect(()=>store.recoverGuestActivities('guest')).toThrow(/Inicia sesión/);
    expect(()=>store.recoverGuestActivities('')).toThrow(/Inicia sesión/);
    expect(store.getLegacyActivityCount()).toBe(1);
    expect(store.recoverGuestActivities('account-a')).toBe(1);
    expect(store.getLocalActivities('account-a')[0].cloudId).toBeNull();
    expect(store.recoverGuestActivities('account-a')).toBe(0);
  });
  it('acepta movimiento plausible y descarta ruido, saltos, baja precisión y duplicados',async()=>{
    start();await store.appendLocationBatch([point(.0001,2),point(.00011,3),point(.02,4),point(.0002,4,100),point(.0002,6),point(.0002,6)]);
    const s=store.getTrackingSnapshot('account-a')!;
    expect(s.route).toHaveLength(3);expect(s.distanceKm).toBeCloseTo(.022239,4);expect(s.rejectedPoints).toBe(3);
  });
  it('ordena lotes y serializa escrituras sin duplicar distancia',async()=>{
    start();await Promise.all([store.appendLocationBatch([point(.0002,4),point(.0001,2)]),store.appendLocationBatch([point(.0002,4),point(.0003,6)])]);
    expect(store.getTrackingSnapshot('account-a')!.route).toHaveLength(4);
    expect(store.getTrackingSnapshot('account-a')!.distanceKm).toBeCloseTo(.033358,4);
  });
  it('rechaza una señal inicial inválida y coordenadas imposibles',()=>{
    expect(()=>store.startLocalTrackingSession({userId:'account-a',activityType:'free_route',groupActivityId:null,title:'Ruta',initialLocation:point(0,0,200)})).toThrow(/precisa/);
    expect(store.isUsablePoint({...store.toStoredCoordinate(point()),latitude:100})).toBe(false);
    expect(store.isUsablePoint({...store.toStoredCoordinate(point()),timestamp:NaN})).toBe(false);
  });
  it('un recorrido pendiente nunca es sobrescrito por otro',()=>{
    start();const before=store.getTrackingSnapshot()!;expect(()=>start()).toThrow(/pendiente/);
    expect(store.getTrackingSnapshot()!.recordId).toBe(before.recordId);
  });
  it('conserva recorridos antiguos de invitado tras reiniciar el módulo',async()=>{
    legacyGuest();await store.appendLocationBatch([point(.0001,2)]);await store.flushLocationQueue();store.markTrackingPendingSave();store.archiveTrackingSession(store.getTrackingSnapshot('account-a')!);
    legacyGuest();store.markTrackingPendingSave();store.archiveTrackingSession(store.getTrackingSnapshot('account-a')!);
    expect(store.getLocalActivities('guest')).toHaveLength(2);expect(store.getTrackingSnapshot()).toBeNull();
    vi.resetModules();store=await import('../src/lib/tracking-store');expect(store.getLocalActivities('guest')).toHaveLength(2);
  });
  it('aisla cuentas y conserva propiedad al reclamar un recorrido de invitado',()=>{
    start('account-a');store.markTrackingPendingSave();store.archiveTrackingSession(store.getTrackingSnapshot('account-a')!);
    expect(store.getLocalActivities('account-b')).toHaveLength(0);
    legacyGuest();store.markTrackingPendingSave();const s=store.getTrackingSnapshot('account-a')!;store.archiveTrackingSession(s);
    store.claimLocalActivity(s.recordId,'account-b');store.claimLocalActivity(s.recordId,'account-a');
    expect(store.getLocalActivities('account-b')[0].ownerId).toBe('account-b');
    expect(store.getLocalActivities('guest')).toHaveLength(0);
  });
  it('un lote tardío no modifica una sesión finalizada',async()=>{
    start();store.markTrackingPendingSave();await store.appendLocationBatch([point(.0001,2)]);expect(store.getTrackingSnapshot()!.route).toHaveLength(1);
  });
  it('el reloj de pantalla reutiliza el trazado sin leer todos los puntos',()=>{
    start();expect(store.getTrackingSnapshot()!.route).toBe(store.getTrackingSnapshot()!.route);
  });
  it('recupera una sesión 1.3.3 existente sin borrar sus puntos',async()=>{
    start('account-a');holder.db!.exec('ALTER TABLE tracking_session DROP COLUMN record_id');
    vi.resetModules();store=await import('../src/lib/tracking-store');
    const s=store.getTrackingSnapshot('account-a')!;expect(s.recordId).toMatch(/^legacy-/);expect(s.route).toHaveLength(1);
  });

  it('la pausa detiene tiempo y puntos, y sobrevive al reinicio',async()=>{
    let now=baseTime;vi.spyOn(Date,'now').mockImplementation(()=>now);
    start();await store.appendLocationBatch([point(.0001,5)]);
    now+=10000;store.pauseLocalTrackingSession('account-a');
    const paused=store.getTrackingSnapshot('account-a')!;
    now+=60000;await store.appendLocationBatch([point(.0002,20)]);
    expect(store.getTrackingSnapshot('account-a')).toMatchObject({status:'paused',durationSeconds:10,distanceKm:paused.distanceKm});
    expect(store.getTrackingSnapshot('account-a')!.route).toHaveLength(2);
    vi.resetModules();store=await import('../src/lib/tracking-store');
    expect(store.getTrackingSnapshot('account-a')).toMatchObject({status:'paused',durationSeconds:10});
    vi.restoreAllMocks();
  });
  it('reanudar crea otro tramo sin sumar el traslado durante la pausa ni su tiempo',async()=>{
    let now=baseTime;vi.spyOn(Date,'now').mockImplementation(()=>now);
    start();await store.appendLocationBatch([point(.0001,5)]);
    now=baseTime+10000;store.pauseLocalTrackingSession('account-a');
    now=baseTime+110000;store.resumeLocalTrackingSession('account-a',point(.5,110));
    now+=5000;await store.appendLocationBatch([point(.5001,115),point(.0002,20)]);
    const resumed=store.getTrackingSnapshot('account-a')!;
    expect(resumed.status).toBe('active');expect(resumed.durationSeconds).toBe(15);
    expect(resumed.distanceKm).toBeCloseTo(.022239,4);
    expect(resumed.route.map(p=>p.segment)).toEqual([0,0,1,1]);
    store.pauseLocalTrackingSession('account-a');
    now+=60000;store.markTrackingPendingSave();
    const final=store.getTrackingSnapshot('account-a')!;
    expect(final.durationSeconds).toBe(15);expect(final.endedAt).toBe(now);
    store.archiveTrackingSession(final);
    expect(store.getLocalActivities('account-a')[0].snapshot.route.map(p=>p.segment)).toEqual([0,0,1,1]);
    vi.restoreAllMocks();
  });
  it('no permite reanudar otra cuenta ni aceptar una ubicación anterior a la pausa',()=>{
    let now=baseTime;vi.spyOn(Date,'now').mockImplementation(()=>now);
    start();now+=10000;store.pauseLocalTrackingSession('account-b');
    expect(store.getTrackingSnapshot('account-a')!.status).toBe('active');
    store.pauseLocalTrackingSession('account-a');now+=10000;
    expect(()=>store.resumeLocalTrackingSession('account-b',point(.0001,20))).toThrow(/esta cuenta/);
    expect(()=>store.resumeLocalTrackingSession('account-a',point(.0001,5))).toThrow(/reciente/);
    expect(()=>store.resumeLocalTrackingSession('account-a',point(.0001,20,150))).toThrow(/precisa/);
    expect(store.getTrackingSnapshot('account-a')!.status).toBe('paused');
    store.markTrackingPendingSave();
    expect(()=>store.resumeLocalTrackingSession('account-a',point(.0001,20))).toThrow(/pausa/);
    vi.restoreAllMocks();
  });
  it('migra una revisión 24 sin borrar puntos y guarda el nombre revisado',async()=>{
    start();await store.appendLocationBatch([point(.0001,5)]);
    holder.db!.exec('ALTER TABLE tracking_session DROP COLUMN paused_at; ALTER TABLE tracking_session DROP COLUMN paused_ms; ALTER TABLE tracking_session DROP COLUMN segment_index; ALTER TABLE tracking_points DROP COLUMN segment;');
    vi.resetModules();store=await import('../src/lib/tracking-store');
    expect(store.getTrackingSnapshot('account-a')!.route).toHaveLength(2);
    expect(store.getTrackingSnapshot('account-a')!.status).toBe('active');
    store.setTrackingTitle('account-a','Mi recorrido');store.markTrackingPendingSave();
    store.archiveTrackingSession(store.getTrackingSnapshot('account-a')!);
    expect(store.getLocalActivities('account-a')[0].snapshot.title).toBe('Mi recorrido');
  });
  it('recupera señal a más de 250 m con tres fixes coherentes sin sumar el puente',async()=>{
    vi.mocked(Date.now).mockReturnValue(baseTime);start();
    vi.mocked(Date.now).mockReturnValue(baseTime+2000);await store.appendLocationBatch([point(.00009,2)]);
    const original=store.getTrackingSnapshot()!;
    vi.mocked(Date.now).mockReturnValue(baseTime+62000);await store.appendLocationBatch([point(.0028,62)]);
    expect(store.getTrackingSnapshot()).toMatchObject({gpsStatus:'acquiring',durationSeconds:2});
    expect(store.getTrackingSnapshot()!.route).toHaveLength(2);
    vi.resetModules();store=await import('../src/lib/tracking-store');
    vi.mocked(Date.now).mockReturnValue(baseTime+66000);await store.appendLocationBatch([point(.00289,64),point(.00298,66)]);
    const recovered=store.getTrackingSnapshot()!;
    expect(recovered.route.map(p=>p.segment)).toEqual([0,0,1,1,1]);
    expect(recovered.distanceKm-original.distanceKm).toBeCloseTo(.020015,4);
    expect(recovered.durationSeconds).toBe(6);expect(recovered.unobservedSeconds).toBe(60);
  });
  it('no convierte un salto GPS aislado en un tramo nuevo',async()=>{
    vi.mocked(Date.now).mockReturnValue(baseTime);start();
    vi.mocked(Date.now).mockReturnValue(baseTime+60000);await store.appendLocationBatch([point(.02,60)]);
    vi.mocked(Date.now).mockReturnValue(baseTime+66000);await store.appendLocationBatch([point(.0001,62),point(.0002,64),point(.0003,66)]);
    const s=store.getTrackingSnapshot()!;
    expect(s.route.every(p=>p.latitude< -32.999)).toBe(true);
    expect(s.distanceKm).toBeLessThan(.03);expect(s.route.map(p=>p.segment)).toEqual([0,1,1,1]);
  });
  it('rechaza iniciar y reanudar con GPS antiguo o adelantado',()=>{
    vi.mocked(Date.now).mockReturnValue(baseTime+120000);
    expect(()=>start()).toThrow(/reciente/);
    expect(store.isFreshTrackingLocation(point(0,0))).toBe(false);
    expect(store.isFreshTrackingLocation(point(0,3600))).toBe(false);
    store.startLocalTrackingSession({userId:'account-a',activityType:'free_route',groupActivityId:null,title:'Ruta',initialLocation:point(0,120)});
    store.pauseLocalTrackingSession('account-a');vi.mocked(Date.now).mockReturnValue(baseTime+180000);
    expect(()=>store.resumeLocalTrackingSession('account-a',point(.001,121))).toThrow(/reciente/);
  });
  it('un timestamp futuro no envenena el ancla y los fixes válidos posteriores se guardan',async()=>{
    vi.mocked(Date.now).mockReturnValue(baseTime);start();
    await store.appendLocationBatch([point(.0001,3600)]);
    vi.mocked(Date.now).mockReturnValue(baseTime+4000);await store.appendLocationBatch([point(.0001,2),point(.0002,4)]);
    expect(store.getTrackingSnapshot()!.route).toHaveLength(3);
    expect(store.getTrackingSnapshot()!.rejectedPoints).toBe(1);
  });
  it('conserva lote fallido en disco, flush comunica error y lo recupera tras reiniciar',async()=>{
    start();holder.failPointWrites=true;
    await expect(store.appendLocationBatch([point(.0001,2)])).rejects.toThrow(/guardar/);
    expect(store.getTrackingSnapshot()).toMatchObject({gpsStatus:'error',trackingError:expect.stringMatching(/guardar/)});
    await expect(store.flushLocationQueue()).rejects.toThrow(/guardar/);
    expect(holder.db!.prepare('SELECT count(*) AS count FROM tracking_pending_batches').get()).toMatchObject({count:1});
    vi.resetModules();store=await import('../src/lib/tracking-store');
    expect(store.getTrackingSnapshot()!.trackingError).toMatch(/guardar/);
    holder.failPointWrites=false;await store.flushLocationQueue();
    expect(store.getTrackingSnapshot()!.route).toHaveLength(2);
    expect(store.getTrackingSnapshot()!.trackingError).toBeNull();
    expect(holder.db!.prepare('SELECT count(*) AS count FROM tracking_pending_batches').get()).toMatchObject({count:0});
  });
  it('recupera puntos previos a la pausa pero no suma entregas posteriores',async()=>{
    start();holder.failPointWrites=true;await expect(store.appendLocationBatch([point(.0001,2)])).rejects.toThrow();
    store.pauseLocalTrackingSession('account-a',baseTime+5000);holder.failPointWrites=false;await store.flushLocationQueue();
    expect(store.getTrackingSnapshot()!.route).toHaveLength(2);
    await store.appendLocationBatch([point(.0002,6)]);expect(store.getTrackingSnapshot()!.route).toHaveLength(2);
  });
  it('lee sólo puntos nuevos y mantiene inmutables los snapshots anteriores',async()=>{
    start();const first=store.getTrackingSnapshot()!;
    await store.appendLocationBatch([point(.0001,2)]);const second=store.getTrackingSnapshot()!;
    await store.appendLocationBatch([point(.0002,4)]);store.getTrackingSnapshot();
    expect(holder.pointReadRows).toEqual([1,1,1]);
    expect(first.route).toHaveLength(1);expect(second.route).toHaveLength(2);
    expect(store.getTrackingSnapshot()!.route).toHaveLength(3);
  });
  it('no cuenta el intervalo sin servicio tras reabrir hasta confirmar posiciones',async()=>{
    vi.mocked(Date.now).mockReturnValue(baseTime);start();
    vi.mocked(Date.now).mockReturnValue(baseTime+60000);await store.noteTrackingInterruption();
    expect(store.getTrackingSnapshot()).toMatchObject({gpsStatus:'interrupted',durationSeconds:0});
  });
  it('mantiene el tiempo observado al detenerse y sólo descuenta la pérdida de señal posterior',async()=>{
    vi.mocked(Date.now).mockReturnValue(baseTime);start();
    for(const seconds of [20,40,60]){vi.mocked(Date.now).mockReturnValue(baseTime+seconds*1000);await store.appendLocationBatch([point(0,seconds)]);}
    vi.mocked(Date.now).mockReturnValue(baseTime+120000);await store.appendLocationBatch([point(.0028,120)]);
    vi.mocked(Date.now).mockReturnValue(baseTime+124000);await store.appendLocationBatch([point(.00289,122),point(.00298,124)]);
    expect(store.getTrackingSnapshot()).toMatchObject({durationSeconds:64,unobservedSeconds:60});
  });
  it('pausar durante pérdida de señal no vuelve a sumar el intervalo desconocido al reanudar',async()=>{
    vi.mocked(Date.now).mockReturnValue(baseTime);start();
    vi.mocked(Date.now).mockReturnValue(baseTime+2000);await store.appendLocationBatch([point(.0001,2)]);
    vi.mocked(Date.now).mockReturnValue(baseTime+60000);store.pauseLocalTrackingSession('account-a');
    expect(store.getTrackingSnapshot()).toMatchObject({status:'paused',durationSeconds:2});
    vi.mocked(Date.now).mockReturnValue(baseTime+120000);store.resumeLocalTrackingSession('account-a',point(.01,120));
    vi.mocked(Date.now).mockReturnValue(baseTime+122000);await store.appendLocationBatch([point(.0101,122)]);
    expect(store.getTrackingSnapshot()).toMatchObject({durationSeconds:4,unobservedSeconds:58});
  });
  it('un flush vacío no oculta un error durable del proveedor de GPS',async()=>{
    start();await store.reportTrackingError('No pudimos reactivar el GPS.');await store.flushLocationQueue();
    vi.resetModules();store=await import('../src/lib/tracking-store');
    expect(store.getTrackingSnapshot()).toMatchObject({gpsStatus:'error',trackingError:'No pudimos reactivar el GPS.'});
    await store.appendLocationBatch([point(.0001,2)]);expect(store.getTrackingSnapshot()!.trackingError).toBeNull();
  });
  it('inicializar recupera lotes fallidos antes de marcar el hueco posterior al cierre',async()=>{
    vi.mocked(Date.now).mockReturnValue(baseTime);start();holder.failPointWrites=true;
    vi.mocked(Date.now).mockReturnValue(baseTime+2000);await expect(store.appendLocationBatch([point(.0001,2)])).rejects.toThrow();
    vi.resetModules();store=await import('../src/lib/tracking-store');holder.failPointWrites=false;
    vi.mocked(Date.now).mockReturnValue(baseTime+60000);await store.initializeTrackingDatabaseBackground();
    expect(store.getTrackingSnapshot()!.route).toHaveLength(2);
    expect(store.getTrackingSnapshot()).toMatchObject({gpsStatus:'interrupted',durationSeconds:2,trackingError:null});
  });
  it('un snapshot con una coordenada corrupta conserva el corte entre los lados válidos',()=>{
    start();store.markTrackingPendingSave();const snapshot=store.getTrackingSnapshot()!;
    snapshot.route=[store.toStoredCoordinate(point(0,0)),{...store.toStoredCoordinate(point(.001,2)),latitude:NaN},store.toStoredCoordinate(point(.002,4))];
    store.archiveTrackingSession(snapshot);
    expect(store.getLocalActivities('account-a')[0].snapshot.route.map(p=>p.segment??0)).toEqual([0,1]);
  });
  it('aísla snapshots corruptos y pagina sólo metadata sin cargar trazados',async()=>{
    start();store.markTrackingPendingSave();store.archiveTrackingSession(store.getTrackingSnapshot()!);
    const first=store.getLocalActivities('account-a')[0];
    holder.db!.prepare('INSERT INTO local_activities(record_id,owner_id,snapshot,saved_at) VALUES(?,?,?,?)').run('bad','account-a','{bad-json',baseTime+20000);
    holder.db!.prepare('UPDATE local_activities SET summary=NULL WHERE record_id=?').run(first.snapshot.recordId);
    expect(store.getLocalActivities('account-a')).toHaveLength(1);
    const summaries=await store.getLocalActivitySummariesAsync('account-a',{limit:1});
    expect(summaries).toHaveLength(1);expect(summaries[0]).not.toHaveProperty('route');
    expect(summaries[0].recordId).toBe(first.snapshot.recordId);
    expect(await store.getLocalActivityAsync(first.snapshot.recordId,'account-b')).toBeNull();
    expect(await store.getLocalActivityAsync(first.snapshot.recordId,'account-a')).toEqual(first);
    expect(holder.db!.prepare('SELECT invalid_snapshot FROM local_activities WHERE record_id=?').get('bad')).toMatchObject({invalid_snapshot:1});
    await store.renameLocalActivityAsync(first.snapshot.recordId,'account-a','Nombre actualizado');
    expect((await store.getLocalActivitySummariesAsync('account-a'))[0].title).toBe('Nombre actualizado');
    expect(await store.getPendingLocalActivitiesAsync('account-a')).toHaveLength(1);
    await store.markLocalActivitySyncedAsync(first.snapshot.recordId,'account-a','cloud-a');
    expect(await store.getPendingLocalActivitiesAsync('account-a')).toHaveLength(0);
  });
  it('elimina sólo los datos locales de la cuenta solicitada y conserva otras cuentas e invitados',async()=>{
    legacyGuest();store.markTrackingPendingSave();store.archiveTrackingSession(store.getTrackingSnapshot()!);
    start('account-b');store.markTrackingPendingSave();store.archiveTrackingSession(store.getTrackingSnapshot()!);
    start('account-a');const id=store.getTrackingSnapshot()!.recordId;
    await store.clearLocalUserData('account-b');
    expect(store.getTrackingSnapshot()!.recordId).toBe(id);expect(store.getLocalActivities('guest')).toHaveLength(1);
    expect(store.getLocalActivities('account-b')).toHaveLength(0);
    await store.clearLocalUserData('account-a');expect(store.getTrackingSnapshot()).toBeNull();expect(store.getLocalActivities('guest')).toHaveLength(1);
    await expect(store.clearLocalUserData('guest')).rejects.toThrow(/cuenta/);
  });
});

it('un plan persiste por cuenta y solo su propietario puede borrarlo', async () => {
  const { readPlans, savePlan, removePlan } = await import('@/lib/planned-routes');
  const points = [{latitude: -33, longitude: -70}, {latitude: -33.001, longitude: -70.002}];
  savePlan('alice', 'Parque', points);
  const [plan] = readPlans('alice');
  expect(plan.points).toEqual(points);
  expect(readPlans('bob')).toEqual([]);
  removePlan('bob', plan.id);
  expect(readPlans('alice')).toEqual([plan]);
  removePlan('alice', plan.id);
  expect(readPlans('alice')).toEqual([]);
});

it('elimina un registro sin GPS solo para la cuenta indicada', async () => {
  start(); store.markTrackingPendingSave();
  const snapshot = store.getTrackingSnapshot()!;
  store.archiveTrackingSession(snapshot);
  await store.deleteLocalActivityAsync('bob', snapshot.recordId, null);
  expect(await store.getLocalActivityAsync(snapshot.recordId, 'account-a')).not.toBeNull();
  await store.deleteLocalActivityAsync('account-a', snapshot.recordId, null);
  expect(await store.getLocalActivityAsync(snapshot.recordId, 'account-a')).toBeNull();
});
