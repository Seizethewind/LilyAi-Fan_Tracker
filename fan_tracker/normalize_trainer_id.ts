export function normalizeTrainerId(raw: string): string {
  return raw.replace(/[\s-]/g, "");
}
