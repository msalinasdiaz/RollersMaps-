import type { LocationObject } from 'expo-location';
import * as SQLite from 'expo-sqlite';

export const BACKGROUND_LOCATION_TASK = 'rollersmaps-active-route-location';

const DATABASE_NAME = 'rollersmaps-tracking.db';
const MAX_LOCATION_ACCURACY_METERS = 50;
const MAX_PLAUSIBLE_SPEED_KMH = 55;
const MAX_SEGMENT_METERS = 250;
const MIN_SEGMENT_METERS = 4;

export type StoredCoordinate = {
  accuracy: number | null;
  latitude: number;
  longitude: number;
  reportedSpeedKmh: number | null;
  timestamp: number;
};

export type TrackingSnapshot = {
  activityType: 'free_route' | 'group_activity';
  averageSpeedKmh: number;
  distanceKm: number;
  durationSeconds: number;
  endedAt: number | null;
  groupActivityId: string | null;
  rejectedPoints: number;
  route: StoredCoordinate[];
  startedAt: number;
  status: 'active' | 'pending_save';
  title: string;
  userId: string;
};

type SessionRow = {
  activity_type: TrackingSnapshot['activityType'];
  distance_km: number;
  ended_at: number | null;
  group_activity_id: string | null;
  last_accuracy: number | null;
  last_latitude: number;
  last_longitude: number;
  last_timestamp: number;
  rejected_points: number;
  started_at: number;
  status: TrackingSnapshot['status'];
  title: string;
  user_id: string;
};

type PointRow = {
  accuracy: number | null;
  latitude: number;
  longitude: number;
  reported_speed_kmh: number | null;
  timestamp: number;
};

let database: SQLite.SQLiteDatabase | null = null;
let backgroundDatabasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
let appendQueue: Promise<void> = Promise.resolve();

function getDatabase() {
  if (database) return database;

  database = SQLite.openDatabaseSync(DATABASE_NAME);
  database.execSync(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS tracking_session (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      status TEXT NOT NULL CHECK (status IN ('active', 'pending_save')),
      user_id TEXT NOT NULL,
      group_activity_id TEXT,
      activity_type TEXT NOT NULL,
      title TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      distance_km REAL NOT NULL DEFAULT 0,
      last_latitude REAL NOT NULL,
      last_longitude REAL NOT NULL,
      last_timestamp INTEGER NOT NULL,
      last_accuracy REAL,
      rejected_points INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS tracking_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      timestamp INTEGER NOT NULL UNIQUE,
      accuracy REAL,
      reported_speed_kmh REAL
    );
    CREATE INDEX IF NOT EXISTS tracking_points_timestamp_idx ON tracking_points(timestamp);
  `);
  return database;
}

function getBackgroundDatabase() {
  if (!backgroundDatabasePromise) {
    backgroundDatabasePromise = SQLite.openDatabaseAsync(DATABASE_NAME).then(async (openedDatabase) => {
      await openedDatabase.execAsync('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
      return openedDatabase;
    });
  }
  return backgroundDatabasePromise;
}

export function startLocalTrackingSession({
  activityType,
  groupActivityId,
  initialLocation,
  title,
  userId,
}: {
  activityType: TrackingSnapshot['activityType'];
  groupActivityId: string | null;
  initialLocation: LocationObject;
  title: string;
  userId: string;
}) {
  const db = getDatabase();
  const point = toStoredCoordinate(initialLocation);

  db.withTransactionSync(() => {
    db.runSync('DELETE FROM tracking_points');
    db.runSync(
      `INSERT OR REPLACE INTO tracking_session
        (id, status, user_id, group_activity_id, activity_type, title, started_at, ended_at, distance_km,
         last_latitude, last_longitude, last_timestamp, last_accuracy, rejected_points)
       VALUES (1, 'active', ?, ?, ?, ?, ?, NULL, 0, ?, ?, ?, ?, 0)`,
      userId,
      groupActivityId,
      activityType,
      title,
      Date.now(),
      point.latitude,
      point.longitude,
      point.timestamp,
      point.accuracy,
    );
    db.runSync(
      `INSERT OR IGNORE INTO tracking_points
        (latitude, longitude, timestamp, accuracy, reported_speed_kmh)
       VALUES (?, ?, ?, ?, ?)`,
      point.latitude,
      point.longitude,
      point.timestamp,
      point.accuracy,
      point.reportedSpeedKmh,
    );
  });
}

export function appendLocationBatch(locations: LocationObject[]) {
  if (!locations.length) return;

  const batch = [...locations];
  const queuedAppend = appendQueue.then(() => appendLocationBatchInternal(batch));
  appendQueue = queuedAppend.catch(() => undefined);
  return queuedAppend;
}

async function appendLocationBatchInternal(locations: LocationObject[]) {
  const db = await getBackgroundDatabase();
  const session = await db.getFirstAsync<SessionRow>("SELECT * FROM tracking_session WHERE id = 1 AND status = 'active'");
  if (!session) return;

  let previous: StoredCoordinate = {
    accuracy: session.last_accuracy,
    latitude: session.last_latitude,
    longitude: session.last_longitude,
    reportedSpeedKmh: null,
    timestamp: session.last_timestamp,
  };
  let distanceKm = session.distance_km;
  let rejectedPoints = session.rejected_points;

  await db.withExclusiveTransactionAsync(async (transaction) => {
    for (const location of [...locations].sort((left, right) => left.timestamp - right.timestamp)) {
      const next = toStoredCoordinate(location);
      if (!isUsablePoint(next) || next.timestamp <= previous.timestamp) {
        rejectedPoints += 1;
        continue;
      }

      const segmentMeters = distanceBetweenMeters(previous, next);
      const elapsedSeconds = (next.timestamp - previous.timestamp) / 1000;
      const impliedSpeedKmh = elapsedSeconds > 0 ? (segmentMeters / 1000) / (elapsedSeconds / 3600) : Number.POSITIVE_INFINITY;
      const uncertaintyThreshold = Math.min(10, Math.max(
        MIN_SEGMENT_METERS,
        Math.max(previous.accuracy ?? MIN_SEGMENT_METERS, next.accuracy ?? MIN_SEGMENT_METERS) * 0.5,
      ));

      if (segmentMeters < uncertaintyThreshold) continue;
      if (segmentMeters > MAX_SEGMENT_METERS || impliedSpeedKmh > MAX_PLAUSIBLE_SPEED_KMH) {
        rejectedPoints += 1;
        continue;
      }

      distanceKm += segmentMeters / 1000;
      await transaction.runAsync(
        `INSERT OR IGNORE INTO tracking_points
          (latitude, longitude, timestamp, accuracy, reported_speed_kmh)
         VALUES (?, ?, ?, ?, ?)`,
        next.latitude,
        next.longitude,
        next.timestamp,
        next.accuracy,
        next.reportedSpeedKmh,
      );
      previous = next;
    }

    await transaction.runAsync(
      `UPDATE tracking_session
       SET distance_km = ?, last_latitude = ?, last_longitude = ?, last_timestamp = ?, last_accuracy = ?, rejected_points = ?
       WHERE id = 1`,
      distanceKm,
      previous.latitude,
      previous.longitude,
      previous.timestamp,
      previous.accuracy,
      rejectedPoints,
    );
  });
}

export function getTrackingSnapshot(userId?: string): TrackingSnapshot | null {
  const db = getDatabase();
  const session = db.getFirstSync<SessionRow>('SELECT * FROM tracking_session WHERE id = 1');
  if (!session || (userId && session.user_id !== userId)) return null;

  const route = db.getAllSync<PointRow>('SELECT latitude, longitude, timestamp, accuracy, reported_speed_kmh FROM tracking_points ORDER BY timestamp');
  const endedAt = session.ended_at;
  const durationSeconds = Math.max(0, Math.floor(((endedAt ?? Date.now()) - session.started_at) / 1000));
  const distanceKm = Number(session.distance_km) || 0;

  return {
    activityType: session.activity_type,
    averageSpeedKmh: durationSeconds > 0 ? distanceKm / (durationSeconds / 3600) : 0,
    distanceKm,
    durationSeconds,
    endedAt,
    groupActivityId: session.group_activity_id,
    rejectedPoints: session.rejected_points,
    route: route.map((point) => ({
      accuracy: point.accuracy,
      latitude: point.latitude,
      longitude: point.longitude,
      reportedSpeedKmh: point.reported_speed_kmh,
      timestamp: point.timestamp,
    })),
    startedAt: session.started_at,
    status: session.status,
    title: session.title,
    userId: session.user_id,
  };
}

export function markTrackingPendingSave(endedAt = Date.now()) {
  getDatabase().runSync("UPDATE tracking_session SET status = 'pending_save', ended_at = ? WHERE id = 1", endedAt);
}

export function clearLocalTrackingSession() {
  const db = getDatabase();
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM tracking_points');
    db.runSync('DELETE FROM tracking_session WHERE id = 1');
  });
}

function toStoredCoordinate(location: LocationObject): StoredCoordinate {
  const reportedSpeedKmh = typeof location.coords.speed === 'number' && location.coords.speed >= 0
    ? location.coords.speed * 3.6
    : null;
  return {
    accuracy: location.coords.accuracy,
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    reportedSpeedKmh: reportedSpeedKmh !== null && reportedSpeedKmh <= MAX_PLAUSIBLE_SPEED_KMH ? reportedSpeedKmh : null,
    timestamp: Math.round(location.timestamp || Date.now()),
  };
}

function isUsablePoint(point: StoredCoordinate) {
  return Number.isFinite(point.latitude)
    && Number.isFinite(point.longitude)
    && point.latitude >= -90
    && point.latitude <= 90
    && point.longitude >= -180
    && point.longitude <= 180
    && point.accuracy !== null
    && point.accuracy > 0
    && point.accuracy <= MAX_LOCATION_ACCURACY_METERS;
}

function distanceBetweenMeters(start: StoredCoordinate, end: StoredCoordinate) {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (value: number) => value * (Math.PI / 180);
  const latitudeDifference = toRadians(end.latitude - start.latitude);
  const longitudeDifference = toRadians(end.longitude - start.longitude);
  const angle = Math.sin(latitudeDifference / 2) ** 2
    + Math.cos(toRadians(start.latitude)) * Math.cos(toRadians(end.latitude)) * Math.sin(longitudeDifference / 2) ** 2;
  return earthRadiusMeters * (2 * Math.atan2(Math.sqrt(angle), Math.sqrt(1 - angle)));
}
