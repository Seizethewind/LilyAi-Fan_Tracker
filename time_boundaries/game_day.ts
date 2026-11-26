import { formatYmd } from "./format_ymd.js";
import { jstDateParts } from "./jst_date_parts.js";

export function gameDay(now: Date): string {
  const { year, month, day } = jstDateParts(now);
  return formatYmd(year, month, day);
}
