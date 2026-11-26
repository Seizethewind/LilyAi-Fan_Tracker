export function formatInt(value: number): string {
  return value.toLocaleString("en-US");
}

export function formatGain(value: number): string {
  return `+${value.toLocaleString("en-US")}`;
}

export function formatUtcTime(isoString: string | null): string {
  if (!isoString) return "Not synced yet";
  const dt = new Date(isoString);
  if (Number.isNaN(dt.getTime())) return isoString;
  const hh = String(dt.getUTCHours()).padStart(2, "0");
  const mm = String(dt.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm} UTC`;
}

export function formatUtcDateTime(isoString: string | null): string {
  if (!isoString) return "Never";
  const dt = new Date(isoString);
  if (Number.isNaN(dt.getTime())) return isoString;
  const yyyy = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  const hh = String(dt.getUTCHours()).padStart(2, "0");
  const mm = String(dt.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mo}-${dd} ${hh}:${mm} UTC`;
}

export function formatCountdown(isoString: string | null): string {
  if (!isoString) return "15:00 UTC";
  const target = new Date(isoString).getTime();
  if (Number.isNaN(target)) return "15:00 UTC";
  const diffMs = target - Date.now();
  if (diffMs <= 0) return "Resetting";
  const totalMin = Math.floor(diffMs / 60_000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return `in ${hours}h ${mins}m`;
  return `in ${mins}m`;
}

export function normalizeTrainerInput(raw: string): string {
  return raw.replace(/[\s-]/g, "");
}
