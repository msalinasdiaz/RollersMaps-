import { describe, expect, it } from 'vitest';
import { formatLocalActivityDate, parseLocalActivityDate, validateActivityDraft } from '@/lib/activity-editor';
const valid = { title: 'Salida al parque', point: 'Entrada principal', start: new Date(2026, 9, 10, 19), end: new Date(2026, 9, 10, 21), capacity: '30' };
describe('Fechas y validación de actividades', () => {
  it('acepta una actividad completa y conserva fecha local en ida/vuelta', () => {
    expect(validateActivityDraft(valid)).toEqual({});
    expect(formatLocalActivityDate(parseLocalActivityDate('2026-10-10 19:30'))).toBe('2026-10-10 19:30');
  });
  it.each(['2026-02-30 19:30', '2026-13-10 19:30', '2026-10-10 25:00', '2026-10-10 19:60', '10/10/2026', ''])('no normaliza una fecha imposible: %s', text => { expect(parseLocalActivityDate(text)).toBeNull(); });
  it('indica inicio y término faltantes por separado', () => {
    expect(validateActivityDraft({ ...valid, start: null, end: null })).toHaveProperty('start');
    expect(validateActivityDraft({ ...valid, start: null, end: null })).toHaveProperty('end');
  });
  it('rechaza término igual o anterior y cupos decimales o fuera de rango', () => {
    expect(validateActivityDraft({ ...valid, end: valid.start })).toHaveProperty('end');
    for (const capacity of ['0', '-1', '501', '2.5', '3e1', '', ' ']) expect(validateActivityDraft({ ...valid, capacity })).toHaveProperty('capacity');
    expect(validateActivityDraft({ ...valid, capacity: '500' })).not.toHaveProperty('capacity');
  });
});
