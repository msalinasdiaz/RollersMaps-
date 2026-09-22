import { describe, expect, it } from 'vitest';
import { currentPlatformGroups, type PlatformGroup } from '@/lib/platform-groups';
describe('Estados de administración general', () => {
  it('conserva grupos aprobados y oculta solicitudes al cumplirse exactamente 48 horas', () => {
    const now=Date.parse('2026-09-24T20:00:00Z');
    const rows=[
      {id:'approved',approval_status:'approved',approval_expires_at:null},
      {id:'approved-old',approval_status:'approved',approval_expires_at:'2026-09-20T00:00:00Z'},
      {id:'pending',approval_status:'pending',approval_expires_at:'2026-09-24T20:00:01Z'},
      {id:'expired',approval_status:'pending',approval_expires_at:'2026-09-24T20:00:00Z'},
      {id:'rejected',approval_status:'rejected',approval_expires_at:'2026-09-24T20:00:01Z'},
      {id:'expired-rejection',approval_status:'rejected',approval_expires_at:'2026-09-24T19:59:59Z'},
    ] as PlatformGroup[];
    expect(currentPlatformGroups(rows,now).map(g=>g.id)).toEqual(['approved','approved-old','pending','rejected']);
  });
});
