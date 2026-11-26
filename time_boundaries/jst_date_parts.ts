export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

export interface JstDateParts {
  year: number;
  month: number;
  day: number;
  weekday: number;
}

export function jstDateParts(moment: Date): JstDateParts {
  const jst = new Date(moment.getTime() + JST_OFFSET_MS);
  const utcDay = jst.getUTCDay();
  const weekday = (utcDay + 6) % 7;
  return {
    year: jst.getUTCFullYear(),
    month: jst.getUTCMonth() + 1,
    day: jst.getUTCDate(),
    weekday,
  };
}
