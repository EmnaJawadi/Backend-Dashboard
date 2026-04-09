export function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

export function startOfDay(value: string | Date): Date {
  const date = toDate(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

export function endOfDay(value: string | Date): Date {
  const date = toDate(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

export function addDays(value: string | Date, days: number): Date {
  const date = new Date(toDate(value));
  date.setDate(date.getDate() + days);
  return date;
}

export function formatIsoDate(value: string | Date): string {
  return toDate(value).toISOString();
}