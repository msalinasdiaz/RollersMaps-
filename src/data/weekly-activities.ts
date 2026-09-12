export type ActivityType = 'clase' | 'ruta' | 'especial' | 'social';

export type WeeklyActivity = {
  id: string;
  dayOfWeek: number;
  type: ActivityType;
  title: string;
  time: string;
  meetingPoint: string;
  endingPoint?: string;
  level?: string;
  difficulty?: string;
  note?: string;
  participants: number;
  capacity: number;
};

export type ScheduledActivity = WeeklyActivity & { date: Date };

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

// Datos de muestra para la primera versión. Más adelante el equipo los publicará desde el panel de organización.
export const weeklyActivities: readonly WeeklyActivity[] = [
  {
    id: 'clases-paseo-bulnes',
    dayOfWeek: 1,
    type: 'clase',
    title: 'Clases: todos los niveles',
    time: '19:30',
    meetingPoint: 'Paseo Bulnes',
    note: 'Con aporte voluntario · casco obligatorio',
    participants: 18,
    capacity: 30,
  },
  {
    id: 'ruta-marin-claro',
    dayOfWeek: 2,
    type: 'ruta',
    title: 'Ruta Marín Claro',
    time: '19:30',
    meetingPoint: 'Metro Santa Isabel, salida B',
    endingPoint: 'Hard Rock, Costanera Center',
    level: 'Nivel 1',
    difficulty: 'Dificultad media',
    participants: 21,
    capacity: 35,
  },
  {
    id: 'ruta-vicente-valdes',
    dayOfWeek: 3,
    type: 'ruta',
    title: 'Ruta Vicente Valdés',
    time: '19:30',
    meetingPoint: 'Metro Vicente Valdés',
    endingPoint: 'Paseo Bulnes',
    level: 'Nivel 3',
    difficulty: 'Dificultad alta',
    participants: 16,
    capacity: 28,
  },
  {
    id: 'ruta-sin-pulmon-ink2',
    dayOfWeek: 5,
    type: 'ruta',
    title: 'Ruta Sin Pulmón + Ink-2',
    time: '19:30',
    meetingPoint: 'Hard Rock, Costanera Center',
    endingPoint: 'Paseo Bulnes',
    level: 'Nivel 3',
    difficulty: 'Dificultad alta',
    participants: 24,
    capacity: 30,
  },
  {
    id: 'cerro-san-cristobal',
    dayOfWeek: 6,
    type: 'especial',
    title: 'Cerro San Cristóbal · solo subida',
    time: '17:30',
    meetingPoint: 'Entrada por Pío Nono',
    level: 'Nivel 3',
    difficulty: 'Dificultad alta',
    note: 'Actividad especial con cupos limitados',
    participants: 11,
    capacity: 20,
  },
  {
    id: 'patin-social',
    dayOfWeek: 0,
    type: 'social',
    title: 'Patín social',
    time: '17:30',
    meetingPoint: "Entrada Parque O'Higgins",
    note: "Acceso por metro Parque O'Higgins o Avenida Matta",
    participants: 33,
    capacity: 60,
  },
] as const;

export const weekDayOrder = [1, 2, 3, 4, 5, 6, 0] as const;

export function startOfWeek(referenceDate = new Date()) {
  const start = new Date(referenceDate);
  const day = start.getDay();
  const distanceToMonday = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + distanceToMonday);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function dateForWeekDay(dayOfWeek: number, referenceDate = new Date()) {
  const start = startOfWeek(referenceDate);
  const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  start.setDate(start.getDate() + offset);
  return start;
}

export function activitiesForDate(date: Date) {
  return weeklyActivities.filter((activity) => activity.dayOfWeek === date.getDay());
}

function withTime(date: Date, time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

export function getUpcomingActivity(referenceDate = new Date()): ScheduledActivity | null {
  if (!weeklyActivities.length) {
    return null;
  }

  const thisWeek = weeklyActivities
    .map((activity) => ({ ...activity, date: withTime(dateForWeekDay(activity.dayOfWeek, referenceDate), activity.time) }))
    .sort((left, right) => left.date.getTime() - right.date.getTime());
  const nextThisWeek = thisWeek.find((activity) => activity.date.getTime() >= referenceDate.getTime());

  if (nextThisWeek) {
    return nextThisWeek;
  }

  return {
    ...weeklyActivities[0],
    date: new Date(withTime(dateForWeekDay(weeklyActivities[0].dayOfWeek, referenceDate), weeklyActivities[0].time).getTime() + 7 * 24 * 60 * 60 * 1000),
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