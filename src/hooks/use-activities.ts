import { useCommunity } from '@/contexts/community';
export function useActivities(enabled = true) {
  const { activities, calendarError, isLoading, refresh } = useCommunity();
  return { activities: enabled ? activities : [], error: enabled ? calendarError : null, isLoading: enabled && isLoading, refresh };
}
