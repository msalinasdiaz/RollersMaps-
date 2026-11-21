export type ActivityFieldErrors = Partial<Record<'title' | 'point' | 'start' | 'end' | 'capacity', string>>;
export function validateActivityDraft(draft: { title: string; point: string; start: Date | null; end: Date | null; capacity: string }): ActivityFieldErrors {
  const errors: ActivityFieldErrors = {};
  if (draft.title.trim().length < 3 || draft.title.trim().length > 90) errors.title = 'Usa un nombre de entre 3 y 90 caracteres.';
  if (draft.point.trim().length < 3 || draft.point.trim().length > 120) errors.point = 'Escribe un punto de encuentro de entre 3 y 120 caracteres.';
  const start = draft.start?.getTime(), end = draft.end?.getTime();
  if (start === undefined || !Number.isFinite(start)) errors.start = 'Elige la fecha y hora de inicio.';
  if (end === undefined || !Number.isFinite(end)) errors.end = 'Elige la fecha y hora de término.';
  else if (start !== undefined && Number.isFinite(start) && end <= start) errors.end = 'El término debe ser posterior al inicio.';
  const count = Number(draft.capacity);
  if (!/^\d+$/.test(draft.capacity.trim()) || !Number.isInteger(count) || count < 1 || count > 500) errors.capacity = 'Indica entre 1 y 500 cupos, sin decimales.';
  return errors;
}
export function parseLocalActivityDate(value: string): Date | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(value.trim());
  if (!parts) return null;
  const [, y, m, d, h, min] = parts.map(Number);
  const result = new Date(y, m - 1, d, h, min);
  return result.getFullYear() === y && result.getMonth() === m - 1 && result.getDate() === d && result.getHours() === h && result.getMinutes() === min ? result : null;
}
export function formatLocalActivityDate(value: Date | null): string {
  if (!value || !Number.isFinite(value.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}`;
}
