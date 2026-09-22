export function canManageGroup(group?: { membership_status: string | null; membership_role: string | null; approval_status?: string }) {
  return (!group?.approval_status || group.approval_status === 'approved') && group?.membership_status === 'active' && ['owner', 'admin'].includes(group.membership_role ?? '');
}
