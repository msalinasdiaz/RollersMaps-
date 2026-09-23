import { describe, expect, it } from 'vitest';
import { routeGeometry, parseRouteGeometry } from '@/lib/route-geometry';
import { currentSpeedKmh, formatTrackingTime } from '@/lib/tracking-metrics';
import type { TrackingSnapshot } from '@/lib/tracking-store';
describe('Tramos GPS, velocidad y tiempo',()=>{
  it('el respaldo conserva los cortes entre pausas y entiende rutas antiguas',()=>{
    const points=[{latitude:-33,longitude:-70,segment:0},{latitude:-33.001,longitude:-70,segment:0},{latitude:-34,longitude:-71,segment:1},{latitude:-34.001,longitude:-71,segment:1}];
    const geometry=routeGeometry(points);
    expect(geometry?.type).toBe('MultiLineString');
    expect(parseRouteGeometry(geometry)).toEqual(points);
    expect(routeGeometry(points.slice(0,2))?.type).toBe('LineString');
    expect(routeGeometry([points[0],points[2]])).toBeNull();
    expect(parseRouteGeometry({type:'LineString',coordinates:[[181,0],[-70,-33]]})).toEqual([{longitude:-70,latitude:-33,segment:0}]);
  });
  it('la velocidad cae a cero cuando la señal deja de llegar o la ruta se pausa',()=>{
    const s={status:'active',route:[{timestamp:10000,reportedSpeedKmh:12,latitude:-33,longitude:-70}]} as TrackingSnapshot;
    expect(currentSpeedKmh(s,11000)).toBe(12);
    expect(currentSpeedKmh(s,21000)).toBe(0);
    expect(currentSpeedKmh({...s,status:'paused'},11000)).toBe(0);
    expect(currentSpeedKmh({...s,status:'pending_save'},11000)).toBe(0);
  });
  it('presenta horas, minutos y segundos sin redondear la duración',()=>{
    expect(formatTrackingTime(1199)).toBe('00:19:59');
    expect(formatTrackingTime(3601)).toBe('01:00:01');
  });
});
