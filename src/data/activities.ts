export type ActivityType = 'clase' | 'ruta' | 'especial' | 'social';

export type AppActivity = {
  groupId: string;
  groupName: string;
  id: string;
  type: ActivityType;
  title: string;
  date: Date;
  endsAt?: Date;
  time: string;
  meetingPoint: string;
  endingPoint?: string;
  level?: string;
  difficulty?: string;
  note?: string;
  participants: number;
  capacity: number;
};

export type PublishedActivityRow = {
  group_id: string;
  group_name: string;
  id: string;
  title: string;
  activity_type: ActivityType;
  starts_at: string;
  ends_at: string | null;
  meeting_point: string;
  ending_point: string | null;
  skill_level: string | null;
  difficulty: 'baja' | 'media' | 'alta' | null;
  capacity: number;
  description: string | null;
  notes: string | null;
  helmet_required: boolean;
  participants: number;
};

export const activityTypeLabels: Record<ActivityType, string> = {
  clase: 'Clase',
  ruta: 'Ruta',
  especial: 'Especial',
  social: 'Patín social',
};

export const activityTypeColors: Record<ActivityType, string> = {
  clase: '#FF9A45',
  ruta: '#7FD34E',
  especial: '#C58BFF',
  social: '#56B6FF',
};

export const weekDayOrder = [1, 2, 3, 4, 5, 6, 0] as const;

export function toAppActivity(row: PublishedActivityRow): AppActivity {
  const date = new Date(row.starts_at);
  const time = new Intl.DateTimeFormat('es-CL', {
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    timeZone: 'America/Santiago',
  }).format(date);

  return {
    groupId: row.group_id,
    groupName: row.group_name,
    capacity: row.capacity,
    date,
    endsAt: row.ends_at ? new Date(row.ends_at) : undefined,
    difficulty: row.difficulty ? `Dificultad ${row.difficulty}` : undefined,
    endingPoint: row.ending_point ?? undefined,
    id: row.id,
    level: row.skill_level ?? undefined,
    meetingPoint: row.meeting_point,
    note: row.notes ?? row.description ?? undefined,
    participants: row.participants,
    time,
    title: row.title,
    type: row.activity_type,
  };
}

export function startOfWeek(referenceDate = new Date()) {
  const start = new Date(referenceDate);
  const day = start.getDay();
  const distanceToMonday = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + distanceToMonday);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function activitiesForDate(activities: readonly AppActivity[], date: Date) {
  return activities.filter((activity) => (
    activity.date.getFullYear() === date.getFullYear()
    && activity.date.getMonth() === date.getMonth()
    && activity.date.getDate() === date.getDate()
  ));
}

export function getUpcomingActivity(activities: readonly AppActivity[], referenceDate = new Date()): AppActivity | null {
  return activities.find((activity) => !getActivityTiming(activity, referenceDate).hasEnded) ?? null;
}

export function getActivityTiming(activity: AppActivity, referenceDate = new Date()) {
  const startsAt = activity.date.getTime();
  const endsAt = activity.endsAt?.getTime() ?? startsAt + 3 * 60 * 60 * 1000;
  const now = referenceDate.getTime();

  return {
    canStart: now >= startsAt && now <= endsAt,
    hasEnded: now > endsAt,
    hasStarted: now >= startsAt,
  };
}

export function formatShortMonth(date: Date) {
  return new Intl.DateTimeFormat('es-CL', { month: 'short' })
    .format(date)
    .replace('.', '')
    .toUpperCase();
}

export function formatShortWeekDay(date: Date) {
  return new Intl.DateTimeFormat('es-CL', { weekday: 'short' })
    .format(date)
    .replace('.', '')
    .toUpperCase();
}
