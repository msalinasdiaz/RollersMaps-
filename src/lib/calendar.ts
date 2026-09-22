import { activitiesForDate, startOfWeek, type AppActivity } from '@/data/activities';

export function calendarWeek(activities: readonly AppActivity[], now: Date, offset = 0) {
  const start = startOfWeek(now);
  start.setDate(start.getDate() + offset * 7);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { date, activities: activitiesForDate(activities, date).sort((a, b) => a.date.getTime() - b.date.getTime()) };
  });
}
export function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
export function weekRange(start: Date, end: Date) {
  const month = new Intl.DateTimeFormat('es-CL', { month: 'long' });
  return start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
    ? `Del ${start.getDate()} al ${end.getDate()} de ${month.format(end)}`
    : `Del ${start.getDate()} de ${month.format(start)} al ${end.getDate()} de ${month.format(end)}`;
}
