import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import type { LocationObject } from 'expo-location';

const holder=vi.hoisted(()=>({db:null as DatabaseSync|null}));
vi.mock('expo-sqlite',async()=>{
  const {DatabaseSync}=await import('node:sqlite');
  function open(){
    holder.db??=new DatabaseSync(':memory:');
    const db=holder.db;
    const api={
      execSync:(sql:string)=>db.exec(sql),
      runSync:(sql:string,...args:(string|number|null)[])=>db.prepare(sql).run(...args),
      getAllSync:<T>(sql:string,...args:(string|number|null)[])=>db.prepare(sql).all(...args) as T[],
      getFirstSync:<T>(sql:string,...args:(string|number|null)[])=>db.prepare(sql).get(...args) as T|undefined,
      withTransactionSync:(fn:()=>void)=>{db.exec('BEGIN');try{fn();db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}},
      execAsync:async(sql:string)=>db.exec(sql),
      runAsync:async(sql:string,...args:(string|number|null)[])=>db.prepare(sql).run(...args),
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
beforeEach(async()=>{vi.resetModules();store=await import('../src/lib/tracking-store');});
afterEach(()=>{holder.db?.close();holder.db=null;});
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
});
