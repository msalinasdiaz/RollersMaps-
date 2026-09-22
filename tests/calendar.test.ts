import { createRequire } from 'node:module';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CalendarActivity } from '@/app/(tabs)/calendar';
import { calendarWeek } from '@/lib/calendar';
import { type AppActivity, toAppActivity, type PublishedActivityRow } from '@/data/activities';
import { canManageGroup } from '@/lib/group-permissions';
vi.mock('@/contexts/demo-session', () => ({ useDemoSession: vi.fn() }));
vi.mock('@/contexts/community', () => ({ useCommunity: vi.fn() }));
vi.mock('@/components/community-ui', () => ({ Notice: () => null, Screen: () => null, ui: {} }));
vi.mock('@/components/group-logo', () => ({ GroupLogo: () => null }));
vi.mock('expo-router', () => ({ router: { push: vi.fn() } }));
vi.mock('react-native', () => ({
  StyleSheet: { create: (value: unknown) => value }, ActivityIndicator: () => null, ScrollView: () => null,
  View: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  Text: ({ children }: { children: ReactNode }) => createElement('span', null, children),
  Pressable: ({ children, disabled }: { children: ReactNode; disabled?: boolean }) => createElement('button', { disabled }, children),
}));
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as { renderToStaticMarkup: (element: ReactElement) => string };
const activity: AppActivity = { id: 'activity', groupId: 'group', groupName: 'Comunidad', title: 'Actividad de prueba', type: 'ruta', date: new Date('2026-09-22T19:30:00'), time: '19:30', meetingPoint: 'Parque', capacity: 30, participants: 24, registrationOpen: true };
const now = new Date('2026-09-22T10:00:00');
function render(admin: boolean, overrides: Partial<AppActivity> = {}, joined = false) {
  return renderToStaticMarkup(createElement(CalendarActivity, { activity: { ...activity, ...overrides }, joined, now, admin, busy: false, disabled: false, onToggle: () => {} }));
}
describe('Calendario semanal y privacidad en pantalla', () => {
  it('un miembro no ve cantidades aunque un servidor anterior todavía las envíe', () => {
    expect(render(false)).not.toMatch(/cupos|inscritos/);
    expect(render(false)).toContain('Inscribirme');
    expect(render(true)).toContain('6 cupos disponibles');
  });
  it('recibir cupos nulos no impide inscribirse si el servidor permite la reserva', () => {
    const adapted = toAppActivity({ group_id: 'group', group_name: 'Comunidad', id: 'a', title: 'Salida', activity_type: 'ruta', starts_at: activity.date.toISOString(), ends_at: null, capacity: null, participants: null, registration_open: true, meeting_point: 'Parque', ending_point: null, skill_level: null, difficulty: null, description: null, notes: null, helmet_required: true } satisfies PublishedActivityRow);
    expect(adapted.registrationOpen).toBe(true);
    expect(render(false, adapted)).not.toContain('disabled');
  });
  it('una actividad cerrada conserva la cancelación de una inscripción existente', () => {
    expect(render(false, { registrationOpen: false })).toContain('Inscripciones cerradas');
    expect(render(false, { registrationOpen: false })).toContain('disabled');
    expect(render(false, { registrationOpen: false }, true)).toContain('Cancelar inscripción');
    expect(render(false, { registrationOpen: false }, true)).not.toContain('disabled');
  });
  it('los finalizados no permiten reservar ni iniciar registro', () => {
    const html = render(false, { date: new Date('2026-09-21T19:30:00') }, true);
    expect(html).toContain('Finalizada'); expect(html).toContain('disabled');
    expect(html).not.toContain('Registrar actividad con GPS');
  });
  it('organiza semanas lunes a domingo y cruza año conservando fechas y orden', () => {
    const week = calendarWeek([], new Date('2027-01-03T12:00:00'));
    expect(week[0].date.getDate()).toBe(28);expect(week[0].date.getFullYear()).toBe(2026);
    expect(week[6].date.getDate()).toBe(3);
    const next = calendarWeek([], new Date('2027-01-03T12:00:00'), 1);
    expect(next[0].date.getDate()).toBe(4);
    const ordered=calendarWeek([{...activity,date:new Date('2026-09-22T20:00:00')},activity],now);
    expect(ordered[1].activities[0].date.getHours()).toBe(19);
  });
  it('un rol administrativo pendiente o suspendido no habilita controles', () => {
    for (const status of ['pending', 'blocked', 'left']) expect(canManageGroup({ membership_status: status, membership_role: 'admin' })).toBe(false);
    expect(canManageGroup({ membership_status: 'active', membership_role: 'member' })).toBe(false);
    expect(canManageGroup({ membership_status: 'active', membership_role: 'owner' })).toBe(true);
  });
});
