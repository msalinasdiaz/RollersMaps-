export type PlatformGroup = {
  id: string; name: string; description: string; city: string; requester_name: string;
  approval_status: 'pending' | 'approved' | 'rejected'; approval_expires_at: string | null;
  created_at: string; reviewed_at: string | null; is_active: boolean; member_count: number;
};
export type GroupFilter = 'all' | PlatformGroup['approval_status'];
export const groupFilters: { value: GroupFilter; label: string }[] = [
  { value: 'all', label: 'Todos' }, { value: 'pending', label: 'Pendientes' },
  { value: 'approved', label: 'Aprobados' }, { value: 'rejected', label: 'Rechazados' },
];
export function currentPlatformGroups(groups: PlatformGroup[], now: number) {
  return groups.filter(group => group.approval_status === 'approved' ||
    (group.approval_expires_at !== null && Date.parse(group.approval_expires_at) > now));
}
