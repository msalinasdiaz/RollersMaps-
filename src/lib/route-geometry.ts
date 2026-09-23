export type RouteCoordinate = { latitude: number; longitude: number; segment?: number };
export function splitRoute<T extends RouteCoordinate>(route: T[]): T[][] {
  const result: T[][] = [];
  for (const point of route) {
    const last = result.at(-1);
    if (!last || (last.at(-1)?.segment ?? 0) !== (point.segment ?? 0)) result.push([point]);
    else last.push(point);
  }
  return result;
}
export function routeGeometry(route: RouteCoordinate[]) {
  const lines = splitRoute(route).filter(line => line.length > 1).map(line => line.map(p => [p.longitude, p.latitude]));
  if (!lines.length) return null;
  return lines.length === 1 ? { type: 'LineString' as const, coordinates: lines[0] } : { type: 'MultiLineString' as const, coordinates: lines };
}
export function parseRouteGeometry(value: unknown): RouteCoordinate[] {
  if (!value || typeof value !== 'object' || !('type' in value) || !('coordinates' in value) || !Array.isArray(value.coordinates)) return [];
  const lines = value.type === 'MultiLineString' ? value.coordinates : value.type === 'LineString' ? [value.coordinates] : [];
  return lines.flatMap((line: unknown, segment) => Array.isArray(line) ? line.flatMap((p: unknown) =>
    Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
    Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90 ? [{ longitude: p[0], latitude: p[1], segment }] : []) : []);
}
export function routeBounds(route: RouteCoordinate[]): [number, number, number, number] {
  let west=180, east=-180, south=90, north=-90;
  for (const p of route) { west=Math.min(west,p.longitude);east=Math.max(east,p.longitude);south=Math.min(south,p.latitude);north=Math.max(north,p.latitude); }
  const x=Math.max((east-west)*.12,.001), y=Math.max((north-south)*.12,.001);
  return [west-x,south-y,east+x,north+y];
}
