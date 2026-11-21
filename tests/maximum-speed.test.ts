import { describe, expect, it } from 'vitest';
import { maximumSpeedKmh, readMaximumSpeed, formatMaximumSpeed } from '@/lib/maximum-speed';
const point = (speed: number | null, timestamp = 1000, latitude = -33, segment = 0) => ({ latitude, longitude: -70, timestamp, segment, accuracy: 5, reportedSpeedKmh: speed });
describe('Velocidad máxima de puntos GPS válidos', () => {
  it('conserva el máximo aunque la última velocidad sea cero', () => {
    expect(maximumSpeedKmh([point(12), point(25, 3000), point(0, 5000)])).toBe(25);
  });
  it('descarta lecturas imposibles y mala precisión, sin convertirlas en un máximo artificial', () => {
    expect(maximumSpeedKmh([point(12), point(120), point(NaN), point(-1), { ...point(40), accuracy: 90 }])).toBe(12);
  });
  it('calcula velocidad con tiempo y distancia cuando el proveedor no la entrega', () => {
    expect(maximumSpeedKmh([point(null), point(null, 3000, -32.9999)])).toBeCloseTo(20.015, 2);
  });
  it('no une pausas, huecos GPS ni saltos de posición para calcular el máximo', () => {
    expect(maximumSpeedKmh([point(null), point(null, 3000, -32.9999, 1)])).toBeNull();
    expect(maximumSpeedKmh([point(null), point(null, 40000, -32.9999)])).toBeNull();
    expect(maximumSpeedKmh([point(null), point(null, 3000, -32)])).toBeNull();
  });
  it('muestra desconocido en rutas antiguas sin tiempos en vez de inventar una velocidad', () => {
    expect(maximumSpeedKmh([{ latitude: -33, longitude: -70 }, { latitude: -33.001, longitude: -70 }])).toBeNull();
    expect(formatMaximumSpeed(null)).toBe('—');
    expect(formatMaximumSpeed(24.3)).toBe('24,3');
  });
  it('valida los datos del respaldo sin aceptar cadenas ni máximos fuera del rango GPS', () => {
    expect(readMaximumSpeed(JSON.parse(JSON.stringify({ type: 'LineString', maximumSpeedKmh: 24.3 })))).toBe(24.3);
    for (const maximumSpeedKmh of ['24', NaN, Infinity, 200, -2]) expect(readMaximumSpeed({ maximumSpeedKmh })).toBeNull();
  });
});
