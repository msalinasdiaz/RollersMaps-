import type { LocationObject } from 'expo-location';
import * as SQLite from 'expo-sqlite';
import { hasRouteGeometry } from './route-geometry';

export const BACKGROUND_LOCATION_TASK = 'rollersmaps-active-route-location';
export const GUEST_OWNER = 'guest';
const DATABASE_NAME = 'rollersmaps-tracking.db';
const MAX_LOCATION_ACCURACY_METERS = 50;
const MAX_PLAUSIBLE_SPEED_KMH = 55;
const MAX_SEGMENT_METERS = 250;
const MIN_SEGMENT_METERS = 4;
const MAX_INITIAL_AGE_MS = 15_000;
const MAX_FUTURE_MS = 5_000;
const SIGNAL_GAP_MS = 30_000;
const RECOVERY_FIXES = 3;
const STORAGE_ERROR = 'No pudimos guardar las últimas ubicaciones. Tu recorrido sigue en este teléfono. Revisa el almacenamiento y vuelve a intentar.';

export type StoredCoordinate = { segment?: number; accuracy: number | null; latitude: number; longitude: number; reportedSpeedKmh: number | null; timestamp: number };
export type TrackingSnapshot = {
  recordId: string; activityType: 'free_route' | 'group_activity'; averageSpeedKmh: number; distanceKm: number; durationSeconds: number;
  endedAt: number | null; groupActivityId: string | null; rejectedPoints: number; route: StoredCoordinate[]; startedAt: number;
  status: 'active' | 'paused' | 'pending_save'; title: string; userId: string;
  gpsStatus?: 'ready' | 'acquiring' | 'interrupted' | 'error'; trackingError?: string | null;
  lastReceivedAt?: number | null; lastPersistedAt?: number | null; unobservedSeconds?: number;
};
type SessionRow = {
  record_id: string; activity_type: TrackingSnapshot['activityType']; distance_km: number; ended_at: number | null;
  group_activity_id: string | null; last_accuracy: number | null; last_latitude: number; last_longitude: number; last_timestamp: number;
  rejected_points: number; started_at: number; status: 'active' | 'pending_save'; paused_at: number | null; paused_ms: number;
  segment_index: number; title: string; user_id: string; last_received_at: number | null; last_persisted_at: number | null;
  last_error: string | null; gap_started_at: number | null; unobserved_ms: number; recovery_points: string | null;
};
type PointRow = { id: number; segment: number; accuracy: number | null; latitude: number; longitude: number; reported_speed_kmh: number | null; timestamp: number };
type PendingRow = { id: number; record_id: string; payload: string; received_at: number };
type LocalRow = { record_id: string; snapshot: string; cloud_id: string | null; owner_id: string };
export type LocalActivity = { snapshot: TrackingSnapshot; cloudId: string | null; ownerId: string };
export type LocalActivitySummary = Omit<TrackingSnapshot, 'route'> & { ownerId: string; cloudId: string | null; pointCount: number; hasRoute: boolean };

let database: SQLite.SQLiteDatabase | null = null;
let backgroundDatabasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
let appendQueue: Promise<void> = Promise.resolve();
let routeCache: { recordId: string; lastId: number; timestamp: number; route: StoredCoordinate[] } | null = null;
const memoryErrors = new Map<string, string>();
const unjournaled = new Map<string, { points: StoredCoordinate[]; receivedAt: number }[]>();

function getDatabase() {
  if (database) return database;
  const opened = SQLite.openDatabaseSync(DATABASE_NAME);
  opened.execSync(`
    PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS tracking_session (
      id INTEGER PRIMARY KEY CHECK(id=1), status TEXT NOT NULL CHECK(status IN ('active','pending_save')),
      user_id TEXT NOT NULL, group_activity_id TEXT, activity_type TEXT NOT NULL, title TEXT NOT NULL,
      started_at INTEGER NOT NULL, ended_at INTEGER, distance_km REAL NOT NULL DEFAULT 0,
      last_latitude REAL NOT NULL, last_longitude REAL NOT NULL, last_timestamp INTEGER NOT NULL,
      last_accuracy REAL, rejected_points INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS tracking_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT, latitude REAL NOT NULL, longitude REAL NOT NULL,
      timestamp INTEGER NOT NULL UNIQUE, accuracy REAL, reported_speed_kmh REAL
    );
    CREATE INDEX IF NOT EXISTS tracking_points_timestamp_idx ON tracking_points(timestamp);
    CREATE TABLE IF NOT EXISTS local_activities (
      record_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, snapshot TEXT NOT NULL, cloud_id TEXT, saved_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tracking_pending_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT, record_id TEXT NOT NULL, payload TEXT NOT NULL, received_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS tracking_pending_record_idx ON tracking_pending_batches(record_id,id);
    CREATE INDEX IF NOT EXISTS local_activities_owner_date_idx ON local_activities(owner_id,saved_at DESC);
  `);
  const columns = opened.getAllSync<{ name: string }>('PRAGMA table_info(tracking_session)');
  const additions = [
    ['record_id','TEXT'], ['paused_at','INTEGER'], ['paused_ms','INTEGER NOT NULL DEFAULT 0'], ['segment_index','INTEGER NOT NULL DEFAULT 0'],
    ['last_received_at','INTEGER'], ['last_persisted_at','INTEGER'], ['last_error','TEXT'], ['gap_started_at','INTEGER'],
    ['unobserved_ms','INTEGER NOT NULL DEFAULT 0'], ['recovery_points','TEXT'],
  ];
  for (const [name,type] of additions) if (!columns.some(c=>c.name===name)) opened.execSync('ALTER TABLE tracking_session ADD COLUMN '+name+' '+type);
  const pointColumns=opened.getAllSync<{name:string}>('PRAGMA table_info(tracking_points)');
  if (!pointColumns.some(c=>c.name==='segment')) opened.execSync('ALTER TABLE tracking_points ADD COLUMN segment INTEGER NOT NULL DEFAULT 0');
  const activityColumns=opened.getAllSync<{name:string}>('PRAGMA table_info(local_activities)');
  if (!activityColumns.some(c=>c.name==='summary')) opened.execSync('ALTER TABLE local_activities ADD COLUMN summary TEXT');
  if (!activityColumns.some(c=>c.name==='invalid_snapshot')) opened.execSync('ALTER TABLE local_activities ADD COLUMN invalid_snapshot INTEGER NOT NULL DEFAULT 0');
  opened.runSync("UPDATE tracking_session SET record_id='legacy-' || user_id || '-' || started_at WHERE record_id IS NULL");
  opened.runSync('UPDATE tracking_session SET last_received_at=last_timestamp WHERE last_received_at IS NULL');
  database=opened; return opened;
}
function getBackgroundDatabase() {
  getDatabase();
  backgroundDatabasePromise ??= SQLite.openDatabaseAsync(DATABASE_NAME).then(async db=>{
    await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;'); return db;
  }).catch(error=>{backgroundDatabasePromise=null;throw error;});
  return backgroundDatabasePromise;
}
export function toStoredCoordinate(location: LocationObject): StoredCoordinate {
  const speed=typeof location.coords.speed==='number' && location.coords.speed>=0 ? location.coords.speed*3.6 : null;
  return {accuracy:location.coords.accuracy,latitude:location.coords.latitude,longitude:location.coords.longitude,
    reportedSpeedKmh:speed!==null && Number.isFinite(speed) && speed<=MAX_PLAUSIBLE_SPEED_KMH ? speed : null,timestamp:Math.round(location.timestamp)};
}
export function isUsablePoint(point: StoredCoordinate) {
  return Number.isFinite(point.timestamp) && point.timestamp>0 && Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
    && Math.abs(point.latitude)<=90 && Math.abs(point.longitude)<=180 && typeof point.accuracy==='number'
    && Number.isFinite(point.accuracy) && point.accuracy>0 && point.accuracy<=MAX_LOCATION_ACCURACY_METERS;
}
export function isFreshTrackingLocation(location: LocationObject, now=Date.now()) {
  const point=toStoredCoordinate(location);
  return isUsablePoint(point) && point.timestamp>=now-MAX_INITIAL_AGE_MS && point.timestamp<=now+MAX_FUTURE_MS;
}
export function distanceBetweenMeters(start: Pick<StoredCoordinate,'latitude'|'longitude'>,end: Pick<StoredCoordinate,'latitude'|'longitude'>) {
  const rad=Math.PI/180;
  const angle=Math.sin((end.latitude-start.latitude)*rad/2)**2 + Math.cos(start.latitude*rad)*Math.cos(end.latitude*rad)*Math.sin((end.longitude-start.longitude)*rad/2)**2;
  const bounded=Math.max(0,Math.min(1,angle)); return 6_371_000*2*Math.atan2(Math.sqrt(bounded),Math.sqrt(1-bounded));
}
export function startLocalTrackingSession({activityType,groupActivityId,initialLocation,title,userId}:{activityType:TrackingSnapshot['activityType'];groupActivityId:string|null;initialLocation:LocationObject;title:string;userId:string}) {
  if (!userId.trim() || userId===GUEST_OWNER) throw new Error('Inicia sesión para comenzar un recorrido.');
  const db=getDatabase(), point=toStoredCoordinate(initialLocation), now=Date.now();
  if (!isUsablePoint(point)) throw new Error('Espera una señal GPS más precisa antes de comenzar.');
  if (!isFreshTrackingLocation(initialLocation,now)) throw new Error('Espera una ubicación GPS reciente antes de comenzar.');
  if (db.getFirstSync('SELECT id FROM tracking_session WHERE id=1')) throw new Error('Hay un recorrido pendiente. Finalízalo antes de comenzar otro.');
  const recordId=`${now}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  db.withTransactionSync(()=>{
    db.runSync('DELETE FROM tracking_points');
    db.runSync(`INSERT INTO tracking_session(id,status,user_id,group_activity_id,activity_type,title,started_at,distance_km,last_latitude,last_longitude,last_timestamp,last_accuracy,record_id,last_received_at,last_persisted_at)
      VALUES(1,'active',?,?,?,?,?,0,?,?,?,?,?,?,?)`,userId,groupActivityId,activityType,title,now,point.latitude,point.longitude,point.timestamp,point.accuracy,recordId,point.timestamp,now);
    db.runSync('INSERT INTO tracking_points(latitude,longitude,timestamp,accuracy,reported_speed_kmh,segment) VALUES(?,?,?,?,?,0)',point.latitude,point.longitude,point.timestamp,point.accuracy,point.reportedSpeedKmh);
  }); routeCache=null;
}
function queue<T>(operation:()=>Promise<T>):Promise<T> {
  const result=appendQueue.then(operation); appendQueue=result.then(()=>undefined,()=>undefined); return result;
}
async function persistError(recordId:string,message:string) {
  memoryErrors.set(recordId,message);
  try {await (await getBackgroundDatabase()).runAsync('UPDATE tracking_session SET last_error=? WHERE record_id=?',message,recordId);}catch{/* Disk failure may prevent writing even the error; keep it visible in memory. */}
}
export function reportTrackingError(message='La señal GPS se interrumpió. Revisa la ubicación del teléfono y vuelve a intentar.') {
  return queue(async()=>{const db=await getBackgroundDatabase();const session=await db.getFirstAsync<SessionRow>("SELECT * FROM tracking_session WHERE id=1 AND status='active'");if(session)await persistError(session.record_id,message);});
}
export function appendLocationBatch(locations:LocationObject[]) {
  if(!locations.length)return Promise.resolve();
  const points=locations.map(toStoredCoordinate),receivedAt=Date.now();
  return queue(async()=>{
    const db=await getBackgroundDatabase();
    const session=await db.getFirstAsync<SessionRow>("SELECT * FROM tracking_session WHERE id=1 AND status='active' AND paused_at IS NULL");if(!session)return;
    try {
      await journalMemoryBatches(db,session.record_id);
      try {await db.runAsync('INSERT INTO tracking_pending_batches(record_id,payload,received_at) VALUES(?,?,?)',session.record_id,JSON.stringify(points),receivedAt);}
      catch(error){const pending=unjournaled.get(session.record_id)??[];pending.push({points,receivedAt});unjournaled.set(session.record_id,pending);throw error;}
      await drainPendingBatches(db,session.record_id);
    }catch{await persistError(session.record_id,STORAGE_ERROR);throw new Error(STORAGE_ERROR);}
  });
}
async function journalMemoryBatches(db:SQLite.SQLiteDatabase,recordId:string) {
  const batches=unjournaled.get(recordId);if(!batches)return;
  while(batches.length){const batch=batches[0];await db.runAsync('INSERT INTO tracking_pending_batches(record_id,payload,received_at) VALUES(?,?,?)',recordId,JSON.stringify(batch.points),batch.receivedAt);batches.shift();}
  unjournaled.delete(recordId);
}
async function drainPendingBatches(db:SQLite.SQLiteDatabase,recordId:string) {
  for(;;){const batch=await db.getFirstAsync<PendingRow>('SELECT id,record_id,payload,received_at FROM tracking_pending_batches WHERE record_id=? ORDER BY id LIMIT 1',recordId);if(!batch)break;await appendStoredBatch(db,batch);}
  memoryErrors.delete(recordId);
  await db.runAsync('UPDATE tracking_session SET last_error=NULL WHERE record_id=? AND last_error=?',recordId,STORAGE_ERROR);
}
function recoveryPoints(value:string|null):StoredCoordinate[] {
  try{const points:unknown=JSON.parse(value??'[]');return Array.isArray(points)?points.filter(p=>p && typeof p==='object' && isUsablePoint(p)).slice(-RECOVERY_FIXES):[];}catch{return [];}
}
function coherent(start:StoredCoordinate,end:StoredCoordinate) {
  const elapsed=end.timestamp-start.timestamp,distance=distanceBetweenMeters(start,end);
  return elapsed>0 && elapsed<=15_000 && distance<=MAX_SEGMENT_METERS && distance/elapsed*3600<=MAX_PLAUSIBLE_SPEED_KMH;
}
async function appendStoredBatch(db:SQLite.SQLiteDatabase,batch:PendingRow) {
  let payload:unknown;try{payload=JSON.parse(batch.payload);}catch{throw new Error(STORAGE_ERROR);}if(!Array.isArray(payload))throw new Error(STORAGE_ERROR);
  const incoming=payload;
  await db.withExclusiveTransactionAsync(async tx=>{
    const session=await tx.getFirstAsync<SessionRow>('SELECT * FROM tracking_session WHERE id=1 AND record_id=?',batch.record_id);
    if(!session){await tx.runAsync('DELETE FROM tracking_pending_batches WHERE id=?',batch.id);return;}
    let previous:StoredCoordinate={accuracy:session.last_accuracy,latitude:session.last_latitude,longitude:session.last_longitude,reportedSpeedKmh:null,timestamp:session.last_timestamp};
    let distanceKm=session.distance_km,rejected=session.rejected_points,segment=session.segment_index;
    let lastReceived=session.last_received_at??session.last_timestamp,gapStarted=session.gap_started_at,unobserved=session.unobserved_ms;
    let candidates=recoveryPoints(session.recovery_points),acceptedUseful=false;
    const insert=async(point:StoredCoordinate)=>tx.runAsync('INSERT OR IGNORE INTO tracking_points(latitude,longitude,timestamp,accuracy,reported_speed_kmh,segment) VALUES(?,?,?,?,?,?)',point.latitude,point.longitude,point.timestamp,point.accuracy,point.reportedSpeedKmh,segment);
    for(const raw of [...incoming].sort((a,b)=>Number(a?.timestamp)-Number(b?.timestamp))){
      const next=raw as StoredCoordinate;
      if(!next || !isUsablePoint(next) || next.timestamp>batch.received_at+MAX_FUTURE_MS || next.timestamp<session.started_at-MAX_INITIAL_AGE_MS || next.timestamp<=previous.timestamp){rejected++;continue;}
      const cutoff=session.paused_at??session.ended_at;
      if(cutoff!==null && next.timestamp>cutoff)continue;
      if(next.timestamp<=lastReceived && candidates.length){rejected++;continue;}
      const meters=distanceBetweenMeters(previous,next),elapsed=next.timestamp-previous.timestamp,speed=meters/elapsed*3600;
      if(gapStarted===null && (next.timestamp-lastReceived>SIGNAL_GAP_MS || (meters>MAX_SEGMENT_METERS && elapsed>SIGNAL_GAP_MS)))gapStarted=lastReceived;
      lastReceived=Math.max(lastReceived,next.timestamp);
      if(gapStarted!==null){
        if((next.accuracy??Infinity)>25){candidates=[];rejected++;continue;}
        const prior=candidates.at(-1);if(prior && !coherent(prior,next))candidates=[];
        candidates.push(next);if(candidates.length<RECOVERY_FIXES)continue;
        segment++;unobserved+=Math.max(0,candidates[0].timestamp-gapStarted);
        let recoveryPrevious:StoredCoordinate|null=null;
        for(const candidate of candidates){if(recoveryPrevious)distanceKm+=distanceBetweenMeters(recoveryPrevious,candidate)/1000;await insert(candidate);recoveryPrevious=candidate;}
        previous=next;candidates=[];gapStarted=null;acceptedUseful=true;continue;
      }
      const threshold=Math.min(10,Math.max(MIN_SEGMENT_METERS,Math.max(previous.accuracy??4,next.accuracy??4)*.5));
      if(meters<threshold){acceptedUseful=true;continue;}
      if(meters>MAX_SEGMENT_METERS || speed>MAX_PLAUSIBLE_SPEED_KMH){rejected++;continue;}
      distanceKm+=meters/1000;await insert(next);previous=next;acceptedUseful=true;
    }
    await tx.runAsync(`UPDATE tracking_session SET distance_km=?,last_latitude=?,last_longitude=?,last_timestamp=?,last_accuracy=?,rejected_points=?,segment_index=?,
      last_received_at=?,last_persisted_at=?,gap_started_at=?,unobserved_ms=?,recovery_points=?,last_error=? WHERE record_id=?`,
      distanceKm,previous.latitude,previous.longitude,previous.timestamp,previous.accuracy,rejected,segment,lastReceived,Date.now(),gapStarted,unobserved,candidates.length?JSON.stringify(candidates):null,acceptedUseful?null:session.last_error,session.record_id);
    await tx.runAsync('DELETE FROM tracking_pending_batches WHERE id=?',batch.id);
  });
}
export async function flushLocationQueue(){return queue(async()=>{const db=await getBackgroundDatabase(),session=await db.getFirstAsync<SessionRow>('SELECT * FROM tracking_session WHERE id=1');if(!session)return;try{await journalMemoryBatches(db,session.record_id);await drainPendingBatches(db,session.record_id);}catch{await persistError(session.record_id,STORAGE_ERROR);throw new Error(STORAGE_ERROR);}});}
export async function initializeTrackingDatabaseBackground(){await getBackgroundDatabase();await flushLocationQueue();await noteTrackingInterruption();}
export function noteTrackingInterruption(now=Date.now()){
  return queue(async()=>{
    const db=await getBackgroundDatabase(),s=await db.getFirstAsync<SessionRow>("SELECT * FROM tracking_session WHERE id=1 AND status='active' AND paused_at IS NULL");
    if(s && now-(s.last_received_at??s.last_timestamp)>SIGNAL_GAP_MS)await db.runAsync('UPDATE tracking_session SET gap_started_at=COALESCE(gap_started_at,last_received_at,last_timestamp) WHERE id=1');
  });
}
export function getTrackingSnapshot(userId?:string):TrackingSnapshot|null {
  const db=getDatabase(),s=db.getFirstSync<SessionRow>('SELECT * FROM tracking_session WHERE id=1');if(!s || (userId && s.user_id!==userId && s.user_id!==GUEST_OWNER))return null;
  if(!routeCache || routeCache.recordId!==s.record_id || routeCache.timestamp!==s.last_timestamp){
    const same=routeCache?.recordId===s.record_id,after=same?routeCache!.lastId:0;
    const rows=db.getAllSync<PointRow>('SELECT id,latitude,longitude,timestamp,accuracy,reported_speed_kmh,segment FROM tracking_points WHERE id>? ORDER BY id',after);
    const added=rows.map(p=>({segment:p.segment,accuracy:p.accuracy,latitude:p.latitude,longitude:p.longitude,reportedSpeedKmh:p.reported_speed_kmh,timestamp:p.timestamp}));
    routeCache={recordId:s.record_id,lastId:rows.at(-1)?.id??after,timestamp:s.last_timestamp,route:same?routeCache!.route.concat(added):added};
  }
  const now=Date.now(),lastReceived=s.last_received_at??s.last_timestamp;
  const stale=s.status==='active' && s.paused_at===null && now-lastReceived>SIGNAL_GAP_MS;
  const interruptedAt=s.gap_started_at??(stale?lastReceived:null),error=memoryErrors.get(s.record_id)??s.last_error;
  const end=s.paused_at??s.ended_at??now,observedEnd=interruptedAt===null?end:Math.min(end,interruptedAt);
  const durationSeconds=Math.max(0,Math.floor((observedEnd-s.started_at-s.paused_ms-s.unobserved_ms)/1000)),distanceKm=Number(s.distance_km)||0;
  return {recordId:s.record_id,activityType:s.activity_type,averageSpeedKmh:durationSeconds>0?distanceKm/(durationSeconds/3600):0,distanceKm,durationSeconds,endedAt:s.ended_at,
    groupActivityId:s.group_activity_id,rejectedPoints:s.rejected_points,route:routeCache.route,startedAt:s.started_at,status:s.status==='active' && s.paused_at!==null?'paused':s.status,title:s.title,userId:s.user_id,
    gpsStatus:error?'error':interruptedAt!==null?(s.recovery_points?'acquiring':'interrupted'):'ready',trackingError:error,lastReceivedAt:lastReceived,lastPersistedAt:s.last_persisted_at,unobservedSeconds:Math.floor(s.unobserved_ms/1000)};
}
export function pauseLocalTrackingSession(userId:string,pausedAt=Date.now()){
  getDatabase().runSync(`UPDATE tracking_session SET paused_at=?,gap_started_at=COALESCE(gap_started_at,CASE WHEN ?-COALESCE(last_received_at,last_timestamp)>? THEN COALESCE(last_received_at,last_timestamp) END)
    WHERE id=1 AND user_id=? AND status='active' AND paused_at IS NULL`,pausedAt,pausedAt,SIGNAL_GAP_MS,userId);
}
export function resumeLocalTrackingSession(userId:string,location:LocationObject,resumedAt=Date.now()){
  const db=getDatabase(),point=toStoredCoordinate(location);if(!isUsablePoint(point))throw new Error('Espera una señal GPS más precisa para reanudar.');
  db.withTransactionSync(()=>{
    const s=db.getFirstSync<SessionRow>("SELECT * FROM tracking_session WHERE id=1 AND user_id=? AND status='active' AND paused_at IS NOT NULL",userId);
    if(!s || s.paused_at===null)throw new Error('No hay un recorrido en pausa para esta cuenta.');
    if(!isFreshTrackingLocation(location,resumedAt) || point.timestamp<s.paused_at || point.timestamp<=s.last_timestamp)throw new Error('Espera una ubicación GPS reciente para reanudar.');
    const unobserved=s.gap_started_at!==null?Math.max(0,s.paused_at-s.gap_started_at):0,segment=s.segment_index+1;
    db.runSync(`UPDATE tracking_session SET paused_ms=paused_ms+?,paused_at=NULL,segment_index=?,last_latitude=?,last_longitude=?,last_timestamp=?,last_accuracy=?,last_received_at=?,last_persisted_at=?,gap_started_at=NULL,recovery_points=NULL,unobserved_ms=unobserved_ms+?,last_error=NULL WHERE id=1`,
      Math.max(0,resumedAt-s.paused_at),segment,point.latitude,point.longitude,point.timestamp,point.accuracy,point.timestamp,resumedAt,unobserved);
    db.runSync('INSERT INTO tracking_points(latitude,longitude,timestamp,accuracy,reported_speed_kmh,segment) VALUES(?,?,?,?,?,?)',point.latitude,point.longitude,point.timestamp,point.accuracy,point.reportedSpeedKmh,segment);memoryErrors.delete(s.record_id);
  });
}
function cleanTitle(title:string){const clean=title.trim();if(clean.length<3 || clean.length>60)throw new Error('Usa entre 3 y 60 caracteres para el nombre.');return clean;}
export function setTrackingTitle(userId:string,title:string){getDatabase().runSync('UPDATE tracking_session SET title=? WHERE id=1 AND user_id=?',cleanTitle(title),userId);}
export function markTrackingPendingSave(endedAt=Date.now()){getDatabase().runSync("UPDATE tracking_session SET status='pending_save',ended_at=? WHERE id=1",endedAt);}
export function clearLocalTrackingSession(){const db=getDatabase(),s=db.getFirstSync<SessionRow>('SELECT * FROM tracking_session WHERE id=1');db.withTransactionSync(()=>{db.runSync('DELETE FROM tracking_points');db.runSync('DELETE FROM tracking_session WHERE id=1');if(s)db.runSync('DELETE FROM tracking_pending_batches WHERE record_id=?',s.record_id);});if(s){memoryErrors.delete(s.record_id);unjournaled.delete(s.record_id);}routeCache=null;}

function parseSnapshot(text:string):TrackingSnapshot|null {
  try{const s=JSON.parse(text);
    if(!s || typeof s!=='object' || typeof s.recordId!=='string' || typeof s.userId!=='string' || typeof s.title!=='string' || !Array.isArray(s.route) || !['free_route','group_activity'].includes(s.activityType) || !['active','paused','pending_save'].includes(s.status) || ![s.startedAt,s.distanceKm,s.durationSeconds,s.averageSpeedKmh].every(Number.isFinite))return null;
    if(s.route.every((point:StoredCoordinate)=>point && typeof point==='object' && isUsablePoint(point)))return s;
    const cleaned:StoredCoordinate[]=[];let interrupted=false,segment=0,previousInput:number|undefined;
    for(const point of s.route){
      if(!point || typeof point!=='object' || !isUsablePoint(point)){interrupted=cleaned.length>0;continue;}
      const input=point.segment??0;
      if(cleaned.length && (interrupted || previousInput!==input))segment++;
      interrupted=false;previousInput=input;cleaned.push({...point,segment});
    }
    s.route=cleaned;return s;
  }catch{return null;}
}
function summaryOf(snapshot:TrackingSnapshot){const {route,...summary}=snapshot;return {...summary,pointCount:route.length,hasRoute:hasRouteGeometry(route)};}
function localActivity(row:LocalRow|undefined):LocalActivity|null {if(!row)return null;const snapshot=parseSnapshot(row.snapshot);return snapshot && snapshot.recordId===row.record_id && snapshot.userId===row.owner_id?{snapshot,cloudId:row.cloud_id,ownerId:row.owner_id}:null;}
export function archiveTrackingSession(snapshot:TrackingSnapshot){
  const db=getDatabase();if(snapshot.status!=='pending_save')throw new Error('Finaliza el recorrido antes de guardarlo.');
  const current=db.getFirstSync<SessionRow>('SELECT * FROM tracking_session WHERE id=1');if(!current || current.record_id!==snapshot.recordId)throw new Error('El recorrido activo ha cambiado.');
  if(unjournaled.get(snapshot.recordId)?.length || db.getFirstSync('SELECT id FROM tracking_pending_batches WHERE record_id=? LIMIT 1',snapshot.recordId))throw new Error(STORAGE_ERROR);
  db.withTransactionSync(()=>{db.runSync('INSERT OR IGNORE INTO local_activities(record_id,owner_id,snapshot,saved_at,summary) VALUES(?,?,?,?,?)',snapshot.recordId,snapshot.userId,JSON.stringify(snapshot),Date.now(),JSON.stringify(summaryOf(snapshot)));db.runSync('DELETE FROM tracking_points');db.runSync('DELETE FROM tracking_session WHERE record_id=?',snapshot.recordId);});memoryErrors.delete(snapshot.recordId);routeCache=null;
}
export function getLocalActivities(ownerId:string,includeGuests=false):LocalActivity[]{const rows=getDatabase().getAllSync<LocalRow>('SELECT record_id,snapshot,cloud_id,owner_id FROM local_activities WHERE (owner_id=? OR owner_id=?) AND invalid_snapshot=0 ORDER BY saved_at DESC',ownerId,includeGuests?GUEST_OWNER:ownerId);return rows.flatMap(row=>{const record=localActivity(row);return record?[record]:[];});}
export function getLocalActivity(recordId:string,ownerId:string):LocalActivity|null{return localActivity(getDatabase().getFirstSync<LocalRow>('SELECT record_id,snapshot,cloud_id,owner_id FROM local_activities WHERE record_id=? AND owner_id=? AND invalid_snapshot=0',recordId,ownerId)??undefined);}
export async function getLocalActivityAsync(recordId:string,ownerId:string):Promise<LocalActivity|null>{const db=await getBackgroundDatabase(),row=await db.getFirstAsync<LocalRow>('SELECT record_id,snapshot,cloud_id,owner_id FROM local_activities WHERE record_id=? AND owner_id=? AND invalid_snapshot=0',recordId,ownerId),record=localActivity(row??undefined);if(row && !record)await db.runAsync('UPDATE local_activities SET invalid_snapshot=1 WHERE record_id=? AND owner_id=?',recordId,ownerId);return record;}
export async function getLocalActivitySummariesAsync(ownerId:string,{limit=20,offset=0,includeGuests=false}:{limit?:number;offset?:number;includeGuests?:boolean}={}):Promise<LocalActivitySummary[]>{
  const db=await getBackgroundDatabase(),pageSize=Math.min(100,Math.max(1,Math.floor(limit))),skip=Math.max(0,Math.floor(offset));
  // Old installations backfill one route at a time, yielding between records.
  for(let i=0;i<skip+pageSize;i++){
    const row=await db.getFirstAsync<LocalRow>('SELECT record_id,snapshot,cloud_id,owner_id FROM local_activities WHERE (owner_id=? OR owner_id=?) AND summary IS NULL AND invalid_snapshot=0 ORDER BY saved_at DESC LIMIT 1',ownerId,includeGuests?GUEST_OWNER:ownerId);if(!row)break;
    const record=localActivity(row);if(record)await db.runAsync('UPDATE local_activities SET summary=? WHERE record_id=?',JSON.stringify(summaryOf(record.snapshot)),row.record_id);else{await db.runAsync('UPDATE local_activities SET invalid_snapshot=1 WHERE record_id=?',row.record_id);i--;}
    await new Promise<void>(resolve=>setTimeout(resolve,0));
  }
  const rows=await db.getAllAsync<{summary:string;owner_id:string;cloud_id:string|null}>('SELECT summary,owner_id,cloud_id FROM local_activities WHERE (owner_id=? OR owner_id=?) AND invalid_snapshot=0 AND summary IS NOT NULL ORDER BY saved_at DESC LIMIT ? OFFSET ?',ownerId,includeGuests?GUEST_OWNER:ownerId,pageSize,skip);
  return rows.flatMap(row=>{try{const s=JSON.parse(row.summary);return s && typeof s.recordId==='string' && !('route' in s)?[{...s,ownerId:row.owner_id,cloudId:row.cloud_id}]:[];}catch{return [];}});
}
export async function getPendingLocalActivitiesAsync(ownerId:string,includeGuests=false,limit=20):Promise<LocalActivity[]>{
  const db=await getBackgroundDatabase(),result:LocalActivity[]=[],pageSize=Math.min(100,Math.max(1,Math.floor(limit)));let lastDate=-1,lastId='';
  while(result.length<pageSize){
    const row=await db.getFirstAsync<LocalRow & {saved_at:number}>(`SELECT record_id,snapshot,cloud_id,owner_id,saved_at FROM local_activities WHERE (owner_id=? OR owner_id=?) AND cloud_id IS NULL AND invalid_snapshot=0 AND (saved_at>? OR (saved_at=? AND record_id>?)) ORDER BY saved_at,record_id LIMIT 1`,ownerId,includeGuests?GUEST_OWNER:ownerId,lastDate,lastDate,lastId);
    if(!row)break;lastDate=row.saved_at;lastId=row.record_id;const record=localActivity(row);if(record)result.push(record);else await db.runAsync('UPDATE local_activities SET invalid_snapshot=1 WHERE record_id=?',row.record_id);
  }return result;
}
export function renameLocalActivity(recordId:string,ownerId:string,title:string){const record=getLocalActivity(recordId,ownerId);if(!record)throw new Error('El recorrido no está disponible.');const snapshot={...record.snapshot,title:cleanTitle(title)};getDatabase().runSync('UPDATE local_activities SET snapshot=?,summary=? WHERE record_id=? AND owner_id=?',JSON.stringify(snapshot),JSON.stringify(summaryOf(snapshot)),recordId,ownerId);}
export async function renameLocalActivityAsync(recordId:string,ownerId:string,title:string){const clean=cleanTitle(title),record=await getLocalActivityAsync(recordId,ownerId);if(!record)throw new Error('El recorrido no está disponible.');const snapshot={...record.snapshot,title:clean};await (await getBackgroundDatabase()).runAsync('UPDATE local_activities SET snapshot=?,summary=? WHERE record_id=? AND owner_id=?',JSON.stringify(snapshot),JSON.stringify(summaryOf(snapshot)),recordId,ownerId);}
export function claimLocalActivity(recordId:string,ownerId:string){if(!ownerId.trim() || ownerId===GUEST_OWNER)throw new Error('Inicia sesión para recuperar tus recorridos.');const record=getLocalActivity(recordId,GUEST_OWNER);if(!record)return;const snapshot={...record.snapshot,userId:ownerId};getDatabase().runSync('UPDATE local_activities SET owner_id=?,snapshot=?,summary=? WHERE record_id=? AND owner_id=?',ownerId,JSON.stringify(snapshot),JSON.stringify(summaryOf(snapshot)),recordId,GUEST_OWNER);}
export async function claimLocalActivityAsync(recordId:string,ownerId:string){if(!ownerId.trim() || ownerId===GUEST_OWNER)throw new Error('Inicia sesión para recuperar tus recorridos.');const record=await getLocalActivityAsync(recordId,GUEST_OWNER);if(!record)return;const snapshot={...record.snapshot,userId:ownerId};await (await getBackgroundDatabase()).runAsync('UPDATE local_activities SET owner_id=?,snapshot=?,summary=? WHERE record_id=? AND owner_id=?',ownerId,JSON.stringify(snapshot),JSON.stringify(summaryOf(snapshot)),recordId,GUEST_OWNER);}
export function getLegacyActivityCount(){return getDatabase().getFirstSync<{count:number}>('SELECT COUNT(*) AS count FROM local_activities WHERE owner_id=? AND invalid_snapshot=0',GUEST_OWNER)?.count??0;}
export function recoverGuestActivities(ownerId:string){if(!ownerId.trim() || ownerId===GUEST_OWNER)throw new Error('Inicia sesión para recuperar tus recorridos.');const db=getDatabase();let recovered=0;db.withTransactionSync(()=>{for(const record of getLocalActivities(GUEST_OWNER)){claimLocalActivity(record.snapshot.recordId,ownerId);recovered++;}});return recovered;}
export function markLocalActivitySynced(recordId:string,ownerId:string,cloudId:string){getDatabase().runSync('UPDATE local_activities SET cloud_id=? WHERE record_id=? AND owner_id=?',cloudId,recordId,ownerId);}
export async function markLocalActivitySyncedAsync(recordId:string,ownerId:string,cloudId:string){await (await getBackgroundDatabase()).runAsync('UPDATE local_activities SET cloud_id=? WHERE record_id=? AND owner_id=?',cloudId,recordId,ownerId);}
export async function clearLocalUserData(userId:string){
  if(!userId.trim() || userId===GUEST_OWNER)throw new Error('Inicia sesión para eliminar los datos de tu cuenta.');
  return queue(async()=>{const db=await getBackgroundDatabase();let removedRecord:string|null=null;
    await db.withExclusiveTransactionAsync(async tx=>{const s=await tx.getFirstAsync<SessionRow>('SELECT * FROM tracking_session WHERE id=1 AND user_id=?',userId);if(s){removedRecord=s.record_id;await tx.runAsync('DELETE FROM tracking_pending_batches WHERE record_id=?',s.record_id);await tx.runAsync('DELETE FROM tracking_points');await tx.runAsync('DELETE FROM tracking_session WHERE id=1 AND user_id=?',userId);}await tx.runAsync('DELETE FROM local_activities WHERE owner_id=?',userId);});
    if(removedRecord){memoryErrors.delete(removedRecord);unjournaled.delete(removedRecord);routeCache=null;}
  });
}

export async function deleteLocalActivityAsync(owner: string, recordId: string | null, cloudId: string | null) {
  const db = await getBackgroundDatabase();
  await db.runAsync('DELETE FROM local_activities WHERE owner_id=? AND (record_id=? OR cloud_id=?)', owner, recordId, cloudId);
}
