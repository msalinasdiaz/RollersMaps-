import { describe,expect,it } from 'vitest';
import { hasRouteGeometry,parseRouteGeometry,routeBounds,routeGeometry,simplifyRouteForDisplay,trimRouteForSharing } from '../src/lib/route-geometry';
describe('Geometría de rutas para mapas y privacidad',()=>{
  it('un dato inválido corta la línea sin dibujar un puente',()=>{
    const points=parseRouteGeometry({type:'LineString',coordinates:[[-70,-33],[-70,-33.001],['invalid',-33.002],[-70,-33.003],[-70,-33.004]]});
    expect(routeGeometry(points)?.type).toBe('MultiLineString');
    expect(points.map(p=>p.segment)).toEqual([0,0,1,1]);
    expect(hasRouteGeometry([{latitude:-33,longitude:-70},{latitude:NaN,longitude:-70},{latitude:-34,longitude:-70}])).toBe(false);
  });
  it('limita bounds geográficos y procesa arrays grandes sin spread',()=>{
    const points=Array.from({length:150000},()=>({latitude:89.999,longitude:179.999}));
    const bounds=routeBounds(points);expect(bounds.every(Number.isFinite)).toBe(true);expect(bounds[2]).toBeLessThanOrEqual(180);expect(bounds[3]).toBeLessThanOrEqual(90);
    expect(routeBounds([]).every(Number.isFinite)).toBe(true);
  });
  it('oculta las zonas de inicio y fin y conserva los cortes al regresar a una zona privada',()=>{
    const points=[0,.003,.004,.0001,.0045,.005,.008].map((latitude,i)=>({latitude:-33+latitude,longitude:-70,segment:0,id:i}));
    const trimmed=trimRouteForSharing(points,200);
    expect(trimmed.map(p=>p.id)).toEqual([1,2,4,5]);
    expect(trimmed.map(p=>p.segment)).toEqual([0,0,1,1]);
    expect(routeGeometry(trimmed)?.type).toBe('MultiLineString');
    expect(points.map(p=>p.segment)).toEqual([0,0,0,0,0,0,0]);
  });
  it('una ruta pequeña totalmente dentro de las zonas privadas no revela puntos',()=>{
    expect(trimRouteForSharing([{latitude:-33,longitude:-70},{latitude:-33.0001,longitude:-70}],200)).toEqual([]);
  });
  it('simplifica sólo representación y conserva extremos de cada pausa',()=>{
    const original=Array.from({length:10000},(_,i)=>({latitude:-33+i*.000001,longitude:-70,segment:i<5000?0:1,id:i}));
    const displayed=simplifyRouteForDisplay(original);
    expect(displayed.length).toBeLessThan(50);expect(original).toHaveLength(10000);
    expect(displayed[0].id).toBe(0);expect(displayed.at(-1)!.id).toBe(9999);
    expect(displayed.some(p=>p.id===4999)).toBe(true);expect(displayed.some(p=>p.id===5000)).toBe(true);
    expect(routeGeometry(displayed)?.type).toBe('MultiLineString');
  });
});
