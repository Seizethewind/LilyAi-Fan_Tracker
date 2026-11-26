export function formatIso(moment: Date): string {
  return moment.toISOString().replace(/\.\d{3}Z$/, "Z");
}
