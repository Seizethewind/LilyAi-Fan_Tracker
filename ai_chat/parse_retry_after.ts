const MAX_WAIT_SECONDS = 3600;

export function parseRetryAfter(raw: string | null | undefined, nowMs = Date.now()): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.min(numeric, MAX_WAIT_SECONDS);
  }
  const parsedDateMs = Date.parse(trimmed);
  if (!Number.isNaN(parsedDateMs)) {
    const diffSeconds = (parsedDateMs - nowMs) / 1000;
    if (diffSeconds > 0) {
      return Math.min(diffSeconds, MAX_WAIT_SECONDS);
    }
  }
  return null;
}
