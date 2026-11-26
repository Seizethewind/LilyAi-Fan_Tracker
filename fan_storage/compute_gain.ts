export function computeGain(current: number, baseline: number | null): number {
  if (baseline === null) return 0;
  if (current < baseline) return current;
  return current - baseline;
}
