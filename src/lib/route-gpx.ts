import type { RouteCoordinate } from './route-geometry';

export function validatePlan(title: string, points: RouteCoordinate[]) {
  if (!title.trim() || title.trim().length > 60) throw new Error('Escribe un nombre de hasta 60 caracteres.');
  if (points.length < 2 || points.some(p => !Number.isFinite(p.latitude) || Math.abs(p.latitude) > 90 ||
    !Number.isFinite(p.longitude) || Math.abs(p.longitude) > 180) ||
    !points.some(p => p.latitude !== points[0].latitude || p.longitude !== points[0].longitude)) {
    throw new Error('Marca al menos dos puntos distintos en el mapa.');
  }
}

export function routeGpx(title: string, points: RouteCoordinate[]) {
  validatePlan(title, points);
  const xmlTitle = Array.from(title.trim()).filter(c => c.codePointAt(0)! >= 32).join('')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const track = points.map(p => `<trkpt lat="${p.latitude}" lon="${p.longitude}"/>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="RollersMaps"><trk><name>${xmlTitle}</name><trkseg>\n${track}\n</trkseg></trk></gpx>`;
}
