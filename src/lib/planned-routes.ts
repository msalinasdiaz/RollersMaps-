import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import { validatePlan } from './route-gpx';
import type { RouteCoordinate } from './route-geometry';

export type PlannedRoute = { id: number; name: string; points: RouteCoordinate[] };
let database: SQLiteDatabase | undefined;
function db() {
  if (!database) {
    const opened = openDatabaseSync('rollersmaps-plans.db');
    opened.execSync('CREATE TABLE IF NOT EXISTS plans (id INTEGER PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL, points TEXT NOT NULL)');
    database = opened;
  }
  return database;
}

export function readPlans(owner: string): PlannedRoute[] {
  return db().getAllSync<{id: number; name: string; points: string}>(
    'SELECT id,name,points FROM plans WHERE owner=? ORDER BY id DESC', owner
  ).map(row => ({ ...row, points: JSON.parse(row.points) }));
}

export function savePlan(owner: string, name: string, points: RouteCoordinate[]) {
  if (!owner) throw new Error('Inicia sesión para guardar la ruta.');
  validatePlan(name, points);
  db().runSync('INSERT INTO plans (owner,name,points) VALUES (?,?,?)', owner, name.trim(), JSON.stringify(points));
}

export function removePlan(owner: string, id: number) {
  db().runSync('DELETE FROM plans WHERE owner=? AND id=?', owner, id);
}
